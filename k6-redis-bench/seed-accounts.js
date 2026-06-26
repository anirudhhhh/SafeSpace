const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { count: 200, base: "http://localhost:3001" };
  for (const a of args) {
    const [k, v] = a.replace(/^--/, "").split("=");
    if (k === "count") out.count = Number(v);
    if (k === "base") out.base = v;
  }
  return out;
}

async function main() {
  const { count, base } = parseArgs();
  console.log(`Seeding ${count} accounts against ${base} ...`);

  const accounts = [];
  const concurrency = 20;
  let created = 0;
  let skipped = 0;

  for (let batchStart = 0; batchStart < count; batchStart += concurrency) {
    const batch = [];
    const batchEnd = Math.min(batchStart + concurrency, count);

    for (let i = batchStart; i < batchEnd; i++) {
      const email = `k6seed_${i}@example.com`;
      const password = "LoadTest123!";

      batch.push(
        fetch(`${base}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: `Seed${i}`,
            whatBringsYou: "k6 seed account",
          }),
        })
          .then((res) => {
            if (res.status === 201 || res.status === 400) {
              accounts.push({ email, password });
              created += res.status === 201 ? 1 : 0;
              skipped += res.status === 400 ? 1 : 0;
            } else {
              console.warn(`  unexpected status ${res.status} for ${email}`);
            }
          })
          .catch((err) => {
            console.error(`  failed to seed ${email}:`, err.message);
          }),
      );
    }

    await Promise.all(batch);
    console.log(`  progress: ${Math.min(batchEnd, count)}/${count}`);
  }

  const outPath = path.resolve(__dirname, "seeded-accounts.json");
  fs.writeFileSync(outPath, JSON.stringify(accounts, null, 2));

  console.log(`\nDone. Created ${created} new, ${skipped} already existed.`);
  console.log(`Wrote ${accounts.length} usable accounts to ${outPath}`);

  if (accounts.length === 0) {
    console.error(
      "\nWARNING: zero usable accounts written. The login scenario in " +
        "k6 will have nothing to authenticate against. Check that your " +
        "server is running and reachable at " +
        base,
    );
    process.exit(1);
  }
}

main();
