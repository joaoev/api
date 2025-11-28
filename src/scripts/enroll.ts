import { Wallets, X509Identity } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import fs from 'fs';

const CCP_PATH = process.env.CCP_PATH ?? './connection-org1.json';
const WALLET_PATH = process.env.WALLET_PATH ?? './wallet';

const ADMIN_ID = process.env.FABRIC_ADMIN_ID ?? 'admin';
const ADMIN_PW = process.env.FABRIC_ADMIN_PW ?? 'adminpw';
const MSP      = process.env.FABRIC_MSP ?? 'Org1MSP';

const APP_USER = process.env.FABRIC_USER ?? 'appUser';
const APP_USER_SECRET = process.env.FABRIC_USER_SECRET ?? 'appUserpw'; // defina no .env

// --- carrega CCP e CA (com TLS do CCP) ---
const ccp = JSON.parse(fs.readFileSync(CCP_PATH, 'utf8'));
const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
if (!caInfo) {
  throw new Error("certificateAuthorities['ca.org1.example.com'] não encontrado no CCP");
}
const ca = new FabricCAServices(
  caInfo.url,                               // ex.: https://localhost:7054
  { trustedRoots: caInfo.tlsCACerts.pem, verify: false }, // verify:true em prod
  caInfo.caName
);

async function main() {
  const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

  // 1) Enroll admin (se necessário)
  let admin = await wallet.get(ADMIN_ID);
  if (!admin) {
    const enrollment = await ca.enroll({ enrollmentID: ADMIN_ID, enrollmentSecret: ADMIN_PW });
    const x509: X509Identity = {
      credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() },
      mspId: MSP,
      type: 'X.509',
    };
    await wallet.put(ADMIN_ID, x509);
    admin = await wallet.get(ADMIN_ID);
    console.log('admin enrolled');
  }

  // 2) Contexto admin
  const provider = wallet.getProviderRegistry().getProvider(admin!.type);
  const adminUser = await provider.getUserContext(admin!, ADMIN_ID);

  // 3) Register appUser COM secret conhecido (do .env)
  let registered = false;
  try {
    await ca.register(
      { enrollmentID: APP_USER, enrollmentSecret: APP_USER_SECRET, affiliation: 'org1.department1', role: 'client' },
      adminUser
    );
    registered = true;
    console.log(`${APP_USER} registered with known secret`);
  } catch (e: any) {
    // Se já existe, o CA não retorna o secret novamente — tudo bem, seguimos para o enroll com o secret do .env
    console.warn(`register skipped (${e?.errors?.[0]?.message ?? String(e)})`);
  }

  // 4) Enroll appUser usando o MESMO secret
  try {
    const enrollment = await ca.enroll({ enrollmentID: APP_USER, enrollmentSecret: APP_USER_SECRET });
    const x509: X509Identity = {
      credentials: { certificate: enrollment.certificate, privateKey: enrollment.key.toBytes() },
      mspId: MSP,
      type: 'X.509',
    };
    await wallet.put(APP_USER, x509);
    console.log(`${APP_USER} enrolled to wallet ${WALLET_PATH}`);
  } catch (e: any) {
    // Se der "Authentication failure", é porque esse usuário foi registrado antes com outro secret
    if (e?.errors?.[0]?.code === 20) {
      throw new Error(
        `Authentication failure no enroll de '${APP_USER}'. ` +
        `Este usuário provavelmente foi registrado anteriormente com outro secret. ` +
        `Soluções: (a) altere FABRIC_USER para um ID novo (ex.: appUser2) e rode novamente; ` +
        `(b) faça network.sh down && up -ca para resetar o CA em dev.`
      );
    }
    throw e;
  }
}

main().catch(err => {
  console.error('Error enrolling identities:', err);
  process.exit(1);
});
