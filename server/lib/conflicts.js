// server/lib/conflicts.js
// Minimal conflict/co-presence engine for schedule blocks.
// Works with Prisma ScheduleBlock shape (strings for status/providerRole).

/**
 * @typedef {Object} Block
 * @property {number} id
 * @property {string} date         // YYYY-MM-DD (local)
 * @property {string} start        // HH:MM
 * @property {string} end          // HH:MM
 * @property {string} status       // "SCHEDULED" | "IN_SESSION" | "CANCELED" | "NO_SHOW" | ...
 * @property {string} providerRole // "RBT" | "BCBA" | "SLP" | "OT" | "PT"
 * @property {number} providerId
 * @property {number} patientId
 * @property {number?} roomId
 */

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h * 60) + (m || 0);
};

const overlap = (a, b, pad = 0) => {
  const sA = toMin(a.start), eA = toMin(a.end);
  const sB = toMin(b.start), eB = toMin(b.end);
  return !(eA + pad <= sB || eB + pad <= sA);
};

const overlapMinutes = (a, b) => {
  const sA = toMin(a.start), eA = toMin(a.end);
  const sB = toMin(b.start), eB = toMin(b.end);
  return Math.max(0, Math.min(eA, eB) - Math.max(sA, sB));
};

/**
 * Hard conflicts and warnings.
 * @param {Block} candidate
 * @param {Block[]} sameDayBlocks
 * @param {Object} options
 * @param {Object} [options.buffers]        // minutes
 * @param {number} [options.buffers.provider] default 0
 * @param {number} [options.buffers.patient]  default 0
 * @param {number} [options.buffers.room]     default 0
 * @returns {{conflicts: any[], warnings: any[]}}
 */
export function checkConflicts(candidate, sameDayBlocks, options = {}) {
  const buffers = {
    provider: options.buffers?.provider ?? 0,
    patient: options.buffers?.patient ?? 0,
    room: options.buffers?.room ?? 0,
  };
  const conflicts = [];
  const warnings = [];

  for (const b of sameDayBlocks) {
    if (b.id === candidate.id) continue;
    if ((b.status || "").toUpperCase() === "CANCELED") continue;

    // Provider double-book
    if (b.providerId === candidate.providerId &&
        overlap(b, candidate, buffers.provider)) {
      conflicts.push({ code: "provider_overlap", with: brief(b) });
    }

    // Patient double-book
    if (b.patientId === candidate.patientId &&
        overlap(b, candidate, buffers.patient)) {
      conflicts.push({ code: "patient_overlap", with: brief(b) });
    }

    // Room double-book (optional if used)
    if (candidate.roomId && b.roomId && candidate.roomId === b.roomId &&
        overlap(b, candidate, buffers.room)) {
      conflicts.push({ code: "room_overlap", with: brief(b) });
    }
  }
  return { conflicts, warnings };
}

/**
 * Co-presence requirements (e.g., BCBA + RBT min overlap minutes).
 * @param {Block} candidate
 * @param {Block[]} sameDayBlocks
 * @param {{require: string, with: string, minMinutes: number}[]} rules
 * @returns {{violations: any[]}}
 */
export function checkCoPresence(candidate, sameDayBlocks, rules = []) {
  const violations = [];

  for (const r of rules) {
    // Only check when the candidate matches the "require" role
    if ((candidate.providerRole || "").toUpperCase() !== r.require) continue;

    // Blocks of the "with" role for the same patient on this date
    const mates = sameDayBlocks.filter(x =>
      (x.providerRole || "").toUpperCase() === r.with &&
      x.patientId === candidate.patientId &&
      (x.status || "").toUpperCase() !== "CANCELED"
    );

    const total = mates.reduce((acc, b) => acc + overlapMinutes(candidate, b), 0);

    if (total < (r.minMinutes || 0)) {
      violations.push({
        code: "copresence_missing",
        require: r.require,
        with: r.with,
        haveMinutes: total,
        needMinutes: r.minMinutes || 0,
      });
    }
  }

  return { violations };
}

function brief(b) {
  return {
    id: b.id,
    start: b.start,
    end: b.end,
    providerRole: b.providerRole,
    providerId: b.providerId,
    patientId: b.patientId,
    roomId: b.roomId ?? null
  };
}
