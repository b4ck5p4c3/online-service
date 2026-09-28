import express from "express";
import dotenv from "dotenv";
import {buildMetrics, Metric} from "./prometheus-builder";

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

interface MACStatus {
    memberId: string;
    memberUsername: string;
    mac: string;
    online: boolean;
    statsEnabled: boolean;
}

let online: MACStatus[] = [];

app.get("/online", (req, res) => {
    res.json([...new Set(online.filter(item => item.online)
      .map(item => item.memberId))]);
});

app.get("/metrics", (req, res) => {
    const metrics: Metric[] = [];
    for (const mac of online) {
        if (!mac.statsEnabled) {
            continue
        }
        metrics.push({
            type: "gauge",
            value: mac.online ? 1 : 0,
            help: "Status of member's MAC online",
            name: "bksp_member_online",
            labels: {
                mac: mac.mac,
                username: mac.memberUsername,
                id: mac.memberId
            }
        });
    }
    const builtMetrics = buildMetrics(metrics)
    res.status(200).header({
        "content-type": "text/plain"
    }).end(builtMetrics);
});

interface MACsResponse {
    macs: {
        memberId: string;
        memberUsername: string;
        mac: string;
    }[],
    statsEnabled: Record<string, boolean>
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

async function fetchOnline(): Promise<MACStatus[]> {
    const macs = await getMACs();
    const leases = await getOpnSenseLeases();

    const onlineLeases = new Set<string>(leases.filter(lease => lease.active)
        .map(lease => lease.mac));
    const online: MACStatus[] = [];

    for (const mac of macs.macs) {
        online.push({
            mac: mac.mac,
            memberId: mac.memberId,
            memberUsername: mac.memberUsername,
            online: onlineLeases.has(mac.mac),
            statsEnabled: !!macs.statsEnabled[mac.memberId]
        });
    }

    return online;
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