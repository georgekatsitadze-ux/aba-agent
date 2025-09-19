// server/prisma/seed.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function localYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  const today = localYYYYMMDD();

  // Wipe existing blocks for a repeatable demo
  await prisma.scheduleBlock.deleteMany({});

  await prisma.scheduleBlock.createMany({
    data: [
      { date: today, start: "09:00", end: "11:00", status: "SCHEDULED", providerRole: "RBT",  providerId: 1,  patientId: 1 },
      { date: today, start: "10:00", end: "12:00", status: "SCHEDULED", providerRole: "RBT",  providerId: 2,  patientId: 2 },
      { date: today, start: "11:00", end: "12:00", status: "SCHEDULED", providerRole: "BCBA", providerId: 10, patientId: 1 },
    ],
  });
  console.log("Seeded schedule blocks.");
}

main().finally(async () => { await prisma.$disconnect(); });
