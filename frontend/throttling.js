import cluster from "cluster";
import os from "os";
import http from "http";

const TARGET_URL = "http://localhost:8080/api/courses";
const NUM_CPUS = os.cpus().length;
const BATCH_SIZE = 2000;

function makeRequest() {
  return new Promise((resolve) => {
    const req = http.get(TARGET_URL, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve("error"));
  });
}

async function worker() {
  let count = 0;
  let totalBlocked = 0;

  while (true) {
    const promises = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      promises.push(makeRequest());
    }

    const results = await Promise.allSettled(promises);
    const statuses = results.map((r) => r.value);

    const blocked = statuses.filter((s) => s === 429).length;
    const errors = statuses.filter((s) => s === "error").length;
    const ok = statuses.filter((s) => s === 200).length;

    count += BATCH_SIZE;
    totalBlocked += blocked;

    console.log(
      `Worker ${process.pid} | Batch #${count / BATCH_SIZE} | ` +
      `200: ${ok} | 429: ${blocked} | ` +
      `Total blocked so far: ${totalBlocked}`
    );
  }
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running with ${NUM_CPUS} workers`);

  for (let i = 0; i < NUM_CPUS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  worker();
}