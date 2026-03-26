import cluster from "cluster";
import os from "os";
import http from "http";

const TARGET_URL = "http://localhost:8080/api/courses";
const NUM_CPUS = os.cpus().length;

const BATCH_SIZE = 2000;   // requests per loop per worker

function makeRequest() {
  return new Promise((resolve, reject) => {
    const req = http.get(TARGET_URL, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });

    req.on("error", reject);
  });
}

async function worker() {
  let count = 0;

  while (true) {
    const promises = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      promises.push(makeRequest());
    }

    await Promise.allSettled(promises);

    count += BATCH_SIZE;

    if (count % 1000 === 0) {
      console.log(`Worker ${process.pid} sent ${count} requests`);
    }
  }
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

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