/**
 * MongoDB Atlas connection diagnostic.
 *
 *   node scripts/check-db.mjs        (or: npm run check-db)
 *
 * Walks the connection step by step and tells you exactly where it breaks:
 * env → public IP → SRV DNS → shard DNS → TCP:27017 → TLS → Mongo handshake.
 */
import "dotenv/config";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

const OK = "\x1b[32m✓\x1b[0m";
const BAD = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m!\x1b[0m";
const line = () => console.log("─".repeat(60));

const URI = process.env.MONGODB_URI ?? "";

function mask(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, (_m, u) => `//${u}:****@`);
}

async function publicIp() {
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) });
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

function tcpProbe(host, port, timeout = 8000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.on("connect", () => done({ ok: true }));
    socket.on("timeout", () => done({ ok: false, reason: "timeout" }));
    socket.on("error", (e) => done({ ok: false, reason: e.code || e.message }));
  });
}

function tlsProbe(host, port, timeout = 8000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.on("secureConnect", () => done({ ok: true, cert: socket.getPeerCertificate()?.subject?.CN }));
    socket.on("timeout", () => done({ ok: false, reason: "timeout" }));
    socket.on("error", (e) => done({ ok: false, reason: e.code || e.message }));
  });
}

async function main() {
  line();
  console.log("  MongoDB Atlas connection check");
  line();

  // 1. Env
  if (!URI) {
    console.log(`${BAD} MONGODB_URI is not set. Create backend-pho-imperial/.env`);
    process.exit(1);
  }
  console.log(`${OK} MONGODB_URI loaded:  ${mask(URI)}`);
  const isSrv = URI.startsWith("mongodb+srv://");
  console.log(`   scheme: ${isSrv ? "mongodb+srv (needs SRV DNS)" : "mongodb (direct hosts)"}`);

  const hostPart = URI.replace(/^mongodb(\+srv)?:\/\/[^@]*@/, "").split(/[/?]/)[0];
  const srvHost = hostPart.split(",")[0].split(":")[0];
  console.log(`   host: ${hostPart}`);

  // 2. Public IP
  const ip = await publicIp();
  line();
  if (ip) {
    console.log(`${OK} Your current public IP:  \x1b[1m${ip}\x1b[0m`);
    console.log(`   → this exact IP (or 0.0.0.0/0) must be in Atlas → Network Access`);
  } else {
    console.log(`${WARN} Could not detect public IP (no internet?)`);
  }

  // 3. DNS
  line();
  let shardHosts = [];
  if (isSrv) {
    try {
      const srv = await dns.resolveSrv(`_mongodb._tcp.${srvHost}`);
      shardHosts = srv.map((s) => s.name);
      console.log(`${OK} SRV DNS resolved ${srv.length} shard host(s):`);
      srv.forEach((s) => console.log(`     ${s.name}:${s.port}`));
    } catch (e) {
      console.log(`${BAD} SRV DNS lookup failed for _mongodb._tcp.${srvHost}: ${e.code || e.message}`);
      console.log(`   → your DNS resolver may block SRV/TXT records. Try switching DNS to`);
      console.log(`     1.1.1.1 / 8.8.8.8, or use the non-SRV connection string from Atlas`);
      console.log(`     ("Connect" → "Drivers" → older driver version shows mongodb:// form).`);
      process.exit(2);
    }
    try {
      const txt = await dns.resolveTxt(srvHost);
      console.log(`${OK} TXT DNS ok: ${txt.flat().join(" ")}`);
    } catch (e) {
      console.log(`${WARN} TXT DNS lookup failed: ${e.code || e.message} (options may be missing)`);
    }
  } else {
    shardHosts = hostPart.split(",").map((h) => h.split(":")[0]);
  }

  for (const h of shardHosts) {
    try {
      const a = await dns.resolve4(h);
      console.log(`${OK} ${h} → ${a.join(", ")}`);
    } catch (e) {
      console.log(`${BAD} ${h} DNS failed: ${e.code || e.message}`);
    }
  }

  // 4. TCP + TLS to :27017
  line();
  let anyTcp = false;
  let anyTlsOk = false;
  let tlsAlert = false;
  for (const h of shardHosts) {
    const tcp = await tcpProbe(h, 27017);
    if (tcp.ok) {
      anyTcp = true;
      const tlsr = await tlsProbe(h, 27017);
      if (tlsr.ok) anyTlsOk = true;
      if (!tlsr.ok && /SSL|TLS|ALERT/i.test(tlsr.reason)) tlsAlert = true;
      console.log(
        `${OK} TCP :27017 ${h} — reachable` +
          (tlsr.ok ? `, TLS ok (CN=${tlsr.cert ?? "?"})` : `, ${BAD} TLS: ${tlsr.reason}`),
      );
    } else {
      console.log(`${BAD} TCP :27017 ${h} — ${tcp.reason}`);
    }
  }

  if (!anyTcp) {
    line();
    console.log(`${BAD} No shard is reachable on port 27017 at all.`);
    console.log(`   → Your network / ISP is blocking outbound port 27017 (some residential`);
    console.log(`     ISPs do). Test on a phone hotspot; if it connects there, it's the ISP.`);
    console.log(`     Workaround: run the DB elsewhere, or use a VPN.`);
    process.exit(3);
  }

  if (anyTcp && !anyTlsOk && tlsAlert) {
    line();
    console.log(`${BAD} TCP opens but Atlas kills the TLS handshake with an alert.`);
    console.log(`   This is the classic signature of: \x1b[1myour IP is NOT in the allow-list.\x1b[0m`);
    console.log(``);
    console.log(`   Fix:`);
    console.log(`   1. https://cloud.mongodb.com  →  your project  →  Network Access`);
    console.log(`   2. "Add IP Address"  →  "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0)  →  Confirm`);
    console.log(`      (or add exactly ${ip ?? "your IP"} — but it changes, so 0.0.0.0/0 is easier`);
    console.log(`       and is required for Render anyway).`);
    console.log(`   3. Wait until the entry shows \x1b[1mActive\x1b[0m (~1 min), then: npm run check-db`);
    process.exit(3);
  }

  // 5. Mongoose handshake
  line();
  let mongoose;
  try {
    mongoose = (await import("mongoose")).default;
  } catch {
    console.log(`${WARN} mongoose not installed — run "npm install" first. Skipping handshake.`);
    process.exit(0);
  }

  try {
    console.log("   connecting with mongoose (20s timeout)…");
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 20_000 });
    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus();
    console.log(`${OK} Connected! MongoDB ${info.version}, host ${info.host}`);
    const cols = await mongoose.connection.db.listCollections().toArray();
    console.log(`${OK} Database "${mongoose.connection.name}" — ${cols.length} collection(s): ${cols.map((c) => c.name).join(", ") || "(empty — run: npm run seed)"}`);
    await mongoose.disconnect();
    line();
    console.log(`${OK} All good. "npm run dev" should start now.`);
    process.exit(0);
  } catch (e) {
    console.log(`${BAD} Mongoose handshake failed: ${e.message.split("\n")[0]}`);
    if (/authentication failed|bad auth/i.test(e.message)) {
      console.log(`   → TCP works but credentials are wrong. Check the user / password in`);
      console.log(`     MONGODB_URI against Atlas → Database Access. Re-URL-encode special chars.`);
    } else if (/ReplicaSetNoPrimary/i.test(e.message)) {
      console.log(`   → TCP opened but no primary. Cluster may be paused/resuming, or the IP`);
      console.log(`     allow-list change hasn't taken effect yet. Wait a minute and retry.`);
    }
    process.exit(4);
  }
}

main().catch((e) => {
  console.error(BAD, e);
  process.exit(1);
});
