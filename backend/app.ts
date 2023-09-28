import { json } from 'body-parser';
import express from 'express';
import { createClient } from 'redis';

export const DEFAULT_BALANCE = 100;

const CHARGE_SCRIPT = `
    local key = KEYS[1]
    local chargeAmount = ARGV[1]
    local balance = redis.call('get', key) or 0
    balance = tonumber(balance)
    chargeAmount = tonumber(chargeAmount)

    if balance >= chargeAmount then
        local newBalance = balance - chargeAmount
        redis.call('set', key, newBalance)
        return newBalance
    else
        return -1
    end
`;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
        const remainingBalance: number = (await client.eval(CHARGE_SCRIPT, {
            keys: [`${account}/balance`],
            arguments: [charges.toString()],
        })) as number;
        const isAuthorized: boolean = remainingBalance >= 0;
        return { isAuthorized, remainingBalance, charges: isAuthorized ? charges : 0 };
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account "${account}"`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            if (result.isAuthorized) {
                console.log(`Authorized and successfully charged account "${account}"`);
            } else {
                console.log(`Not authorized for account "${account}"`);
            }
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
