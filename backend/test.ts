import { performance } from 'perf_hooks';
import supertest from 'supertest';
import { buildApp, DEFAULT_BALANCE } from './app';

const app = supertest(buildApp());

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start: number = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function simultaneousRequestsTest(chargeAmount: number = DEFAULT_BALANCE, numberOfRequests: number = 5) {
    await app.post("/reset").expect(204);
    const expectedSuccesses: number = Math.floor(DEFAULT_BALANCE / chargeAmount);
    console.log(`Expected authorized requests: ${expectedSuccesses}`);
    let currentSuccesses: number = 0;
    const start: number = performance.now();
    const promises: Array<Promise<unknown>> = [];

    for (let i = 0; i < numberOfRequests; i++) {
        promises.push(
            app
                .post("/charge")
                .send({ charges: chargeAmount })
                .expect((res) => {
                    if (res.status === 500) {
                        throw new Error(`Expected 200 but got ${res.status}`);
                    } else if (res.status === 200 && res.body.isAuthorized) {
                        if (currentSuccesses === expectedSuccesses) {
                            throw new Error(`Exceeded expected authorized requests: ${expectedSuccesses}`);
                        }
                        currentSuccesses++;
                    }
                }),
        );
    }
    await Promise.all(promises);
    console.log(`Latency: ${performance.now() - start} ms`);
    console.log(`Authorized requests: ${expectedSuccesses}, not authorized: ${numberOfRequests - expectedSuccesses}`);
}

async function insufficientFundsTest() {
    await app.post("/reset").expect(204);
    await app
        .post("/charge")
        .send({ charges: DEFAULT_BALANCE + 1 })
        .expect(200)
        .then((res) => {
            if (res.body.isAuthorized) {
                throw new Error("Should not authorize when balance is insufficient");
            }
        });
}

async function resetTest() {
    await app.post("/reset").expect(204);
    await app.post("/charge").send({ charges: DEFAULT_BALANCE }).expect(200);
    await app.post("/reset").expect(204);
    await app.post("/charge").send({ charges: DEFAULT_BALANCE }).expect(200);
}

async function runTests() {
    console.log(`----------------------`);
    console.log(`Running basicLatencyTest():`);
    await basicLatencyTest();
    console.log(`----------------------`);
    console.log(`Running simultaneousRequestsTest() - basic test:`);
    await simultaneousRequestsTest();
    console.log(`----------------------`);
    console.log(`Running insufficientFundsTest():`);
    await insufficientFundsTest();
    console.log(`----------------------`);
    console.log(`Running resetTest():`);
    await resetTest();
    console.log(`----------------------`);
    console.log(`Running simultaneousRequestsTest() - stress test:`);
    await simultaneousRequestsTest(10, 1000);
}

runTests().catch(console.error);
