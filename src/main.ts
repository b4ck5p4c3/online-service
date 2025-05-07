import express from "express";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({
    path: ".env.local"
});

const PORT = parseInt(process.env.PORT ?? "8011");
const FETCH_INTERVAL = parseInt(process.env.FETCH_INTERVAL ?? "5000");
const MACS_API_URL = process.env.MACS_API_URL ?? "https://swynca.bksp.in";
const MACS_FETCH_TOKEN = process.env.MACS_FETCH_TOKEN ?? "";
const OPNSENSE_URL = process.env.OPNSENSE_URL ?? "https://opnsense";
const OPNSENSE_API_KEY = process.env.OPNSENSE_API_KEY ?? "";
const OPNSENSE_API_SECRET = process.env.OPNSENSE_API_SECRET ?? "";

const app = express();

let online: string[] = [];

app.get("/online", (req, res) => {
    res.json(online);
});

interface MACsResponse {
    macs: Record<string, string[]>;
}

async function getMACs(): Promise<MACsResponse> {
    return await (await fetch(`${MACS_API_URL}/api/macs/system`, {
        headers: {
            authorization: `Token ${MACS_FETCH_TOKEN}`
        }
    })).json();
}

interface DHCPLease {
    mac: string;
    active: boolean;
}

interface OpnSenseDHCPv4LeasesResponse {
    rows: {
        mac: string,
        status: "offline" | "online"
    }[];
}

async function getOpnSenseLeases(): Promise<DHCPLease[]> {
    const rawResponse = await (await fetch(`${OPNSENSE_URL}/api/dhcpv4/leases/searchLease`, {
        headers: {
            authorization: `Basic ${btoa(`${OPNSENSE_API_KEY}:${OPNSENSE_API_SECRET}`)}`
        }
    })).json() as OpnSenseDHCPv4LeasesResponse;

    return rawResponse.rows.map(row => ({
        mac: row.mac.toUpperCase(),
        active: row.status === "online"
    }));
}

async function fetchOnline(): Promise<string[]> {
    const macs = await getMACs();
    const leases = await getOpnSenseLeases();

    const onlineLeases = new Set<string>(leases.filter(lease => lease.active)
        .map(lease => lease.mac));
    const online = new Set<string>();

    for (const user in macs.macs) {
        const userMacs = macs.macs[user];
        for (const mac of userMacs) {
            if (onlineLeases.has(mac)) {
                online.add(user);
            }
        }
    }

    return [...online].sort();
}

function startFetchingOnline() {
    fetchOnline().then(newOnline => {
        online = newOnline;
    }).catch(e => {
        console.error(e);
    }).finally(() => {
        setTimeout(() => startFetchingOnline(), FETCH_INTERVAL);
    });
}

app.listen(PORT);

startFetchingOnline();