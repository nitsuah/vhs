// ── TLS CERT GENERATION ───────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { CERT_DIR, HOST_IP } = require('./config');

function ensureCerts() {
  const caKey  = path.join(CERT_DIR, 'ca.key');
  const caCert = path.join(CERT_DIR, 'ca.crt');
  const srvKey = path.join(CERT_DIR, 'server.key');
  const srvCrt = path.join(CERT_DIR, 'server.crt');

  if (fs.existsSync(srvCrt) && fs.existsSync(srvKey) && fs.existsSync(caCert)) {
    console.log('✓ TLS certs loaded from', CERT_DIR);
    return;
  }

  console.log('⟳ Generating self-signed CA + server cert…');
  fs.mkdirSync(CERT_DIR, { recursive: true });

  const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
  if (HOST_IP) sanParts.push(`IP:${HOST_IP}`);
  const san = sanParts.join(',');

  const extFile = path.join(CERT_DIR, 'ext.cnf');
  fs.writeFileSync(extFile, `[SAN]\nsubjectAltName=${san}\n`);

  execSync(`openssl genrsa -out "${caKey}" 2048`);
  execSync(`openssl req -new -x509 -days 3650 -key "${caKey}" -out "${caCert}" -subj "/CN=VHS Scanner Local CA/O=VHS Scanner"`);
  execSync(`openssl genrsa -out "${srvKey}" 2048`);
  execSync(`openssl req -new -key "${srvKey}" -out "${CERT_DIR}/server.csr" -subj "/CN=VHS Scanner/O=VHS Scanner"`);
  execSync(`openssl x509 -req -days 3650 -in "${CERT_DIR}/server.csr" -CA "${caCert}" -CAkey "${caKey}" -CAcreateserial -out "${srvCrt}" -extensions SAN -extfile "${extFile}"`);

  console.log(`✓ TLS certs generated (SAN: ${san})`);
}

module.exports = { ensureCerts };