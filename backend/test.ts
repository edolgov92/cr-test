import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp, DEFAULT_BALANCE } from "./app";

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

async function simultaneousRequestsTest() {
    await app.post("/reset").expect(204);
    const chargeAmount: number = DEFAULT_BALANCE;
    const numberOfRequests: number = 5;
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

async function runTests() {
    console.log(`----------------------`);
    console.log(`Running basicLatencyTest():`);
    await basicLatencyTest();
    console.log(`----------------------`);
    console.log(`Running simultaneousRequestsTest():`);
    await simultaneousRequestsTest();
}

runTests().catch(console.error);
