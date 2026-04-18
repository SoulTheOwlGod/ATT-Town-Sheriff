const { Client } = require("att-client");
const { myUserConfig } = require("./config.js");
const { sendGriefAlert, setConnection } = require('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff Discord/discord.js');

const client = new Client(myUserConfig);

// ===== CONFIG =====
const POLL_INTERVAL = 500;
const BAG_SWAP_DISTANCE = 3;
const GRIEF_DROP_THRESHOLD = 10;

// ===== GRIEF ITEM LIST =====
const GRIEF_LIST = [
  { name: 'Spriggull Feather Blue', id: 7918 },
  { name: 'Spriggull Feather Red', id: 18734 },
  { name: 'Spriggull Fletching Blue', id: 50608 },
  { name: 'Spriggull Fletching Red', id: 24072 },
  { name: 'Spriggull Drumstick Bone', id: 24406 },
  { name: 'Small Bone Spike', id: 61488 },
];

// ===== STATE =====
let connection = null;
let playerData = [];
let dropTracking = {};
let playerHealth = {};
let bagSwapCooldowns = {};

// ===== MAIN POLL =====
async function pollPlayers() {
  try {
    const res = await connection.send('player list-detailed');
    playerData = res?.data?.Result || [];
    if (playerData.length > 0) {
      console.log('[DEBUG] First player data:', JSON.stringify(playerData[0]));
    }
  } catch (err) {
    console.error('[Poll] Error:', err.message);
  }
}

// ===== ANTI BAG SWAP =====
async function runAntiBagSwap() {
  // Build inventory for all players first
  const inventories = {};
  for (const player of playerData) {
    const username = player.username || player.Username;
    const invRes = await connection.send(`player inventory ${username}`);
    inventories[username] = invRes?.data?.Result?.[0];
  }
  for (const player of playerData) {
    const username = player.username || player.Username;
    const inv = inventories[username];
    console.log(`[DEBUG] ${username} RightHand: ${inv?.RightHand?.Name || 'empty'} | LeftHand: ${inv?.LeftHand?.Name || 'empty'} | Back: ${inv?.Back?.[0]?.Name || 'empty'}`);
  }
  for (const swapper of playerData) {
    const swapperName = swapper.username || swapper.Username;
    const swapperInv = inventories[swapperName];
    if (!swapperInv) continue;

    // Check if swapper is holding a bag in hand
    const holdingBagInHand =
      (swapperInv.RightHand?.Name || '').toLowerCase().includes('bag') ||
      (swapperInv.LeftHand?.Name || '').toLowerCase().includes('bag');
    if (!holdingBagInHand) continue;

    // Get the hand position that's holding the bag
    const handPos = (swapperInv.RightHand?.Name || '').toLowerCase().includes('bag')
      ? swapper.rightHandPosition
      : swapper.leftHandPosition;
    if (!handPos) continue;

    for (const victim of playerData) {
      const victimName = victim.username || victim.Username;
      if (victimName === swapperName) continue;

      const victimInv = inventories[victimName];
      if (!victimInv) continue;

      const victimPos = victim.position || victim.Position;
      if (!victimPos) continue;

      const victimBackPos = [
        victimPos[0] - 0.767,
        victimPos[1] + 0.811,
        victimPos[2] - 1.226
      ];

      const dist = Math.sqrt(
        Math.pow(handPos[0] - victimBackPos[0], 2) +
        Math.pow(handPos[1] - victimBackPos[1], 2) +
        Math.pow(handPos[2] - victimBackPos[2], 2)
      );

      console.log(`[BagSwap] ${swapperName} hand dist to ${victimName} back: ${dist.toFixed(2)}`);

      console.log(`[BagSwap] ${swapperName} hand dist to ${victimName} back: ${dist.toFixed(2)}`);
      if (dist < BAG_SWAP_DISTANCE) {
        const pairKey = [swapperName, victimName].sort().join(':');
        if (!bagSwapCooldowns[pairKey]) {
          console.log(`[AntiBagSwap] ${swapperName} is trying to bag swap ${victimName}!`);
          bagSwapCooldowns[pairKey] = true;

          await connection.send(`player message ${swapperName} "BEWARE you have been detected bag swapping please stop before we take action" 10`);
          await connection.send(`player message ${victimName} "BEWARE you are being bag swapped please dont let go of your bag" 10`);

          setTimeout(() => {
            delete bagSwapCooldowns[pairKey];
          }, 10000);
        }
      }
    }
  }
}

// ===== HEALTH MONITOR / ANTI DUPE =====
async function runHealthMonitor() {
  for (const player of playerData) {
    const username = player.username || player.Username;
    const health = player.health || player.Health;
    const lastHealth = playerHealth[username];
    playerHealth[username] = health;

    if (lastHealth === undefined) continue;

    const takingDamage = health < lastHealth;

    // Anti dupe check — coords and orb ID to be filled in later
    // if (takingDamage && isAtDupeLocation && holdingOrb) { kill and flag }
  }
}

// ===== STARTUP =====
async function main() {
  await client.start();
  console.log('[Bot] Logged in as ' + myUserConfig.username + '!');

  connection = await client.openServerConnection(1704646669);
  console.log('[Bot] Connected to server!');

  setConnection(connection);

  connection.subscribe('InventoryChanged', async (event) => {
    const username = event.data?.User?.username || event.data?.User?.Username;
    const changeType = (event.data?.ChangeType || '').toLowerCase();
    const itemName = event.data?.ItemName || '';

    if (!username) return;

    const isGriefItem = GRIEF_LIST.some(i =>
      i.name.toLowerCase() === itemName.toLowerCase()
    );

    if (!isGriefItem) return;

    if (!dropTracking[username]) {
      dropTracking[username] = { count: 0, justUndocked: false, holdingFromBag: false };
    }

    const tracking = dropTracking[username];

    if (changeType === 'undock') {
      tracking.holdingFromBag = true;
      tracking.justUndocked = true;
      console.log(`[Undock] ${username} took ${itemName} out of bag`);
      return;
    }

    if (changeType === 'drop') {
      if (!tracking.holdingFromBag) return;
      tracking.holdingFromBag = false; // reset immediately so next undock works

      const player = playerData.find(p => (p.username || p.Username) === username);
      const pos = player?.position || player?.Position;
      const capturedPos = pos ? [...pos] : null; // snapshot position

      setTimeout(() => {
        if (tracking.lastDropPos && capturedPos) {
          const dist = Math.sqrt(
            Math.pow(capturedPos[0] - tracking.lastDropPos[0], 2) +
            Math.pow(capturedPos[1] - tracking.lastDropPos[1], 2) +
            Math.pow(capturedPos[2] - tracking.lastDropPos[2], 2)
          );
          if (dist > 4) {
            console.log(`[AntiGrief] ${username} dropped far away, resetting count`);
            tracking.count = 0;
          }
        }

        tracking.lastDropPos = capturedPos;
        tracking.count++;
        console.log(`[AntiGrief] ${username} dropped ${itemName} from bag (${tracking.count}/${GRIEF_DROP_THRESHOLD})`);

        if (tracking.count >= GRIEF_DROP_THRESHOLD) {
          console.log(`[AntiGrief] ${username} flagged!`);
          dropTracking[username] = { count: 0, holdingFromBag: false, lastDropPos: null };
          sendGriefAlert(username, itemName, GRIEF_DROP_THRESHOLD);
        }
      }, 1000);
      return;
    }

    if (changeType === 'dock') {
      // Dock followed the drop = put back in bag, cancel timer
      clearTimeout(tracking.dropTimer);
      tracking.holdingFromBag = false;
      tracking.justUndocked = false;
      console.log(`[Dock] ${username} put ${itemName} back in bag`);
      return;
    }

    if (changeType === 'pickup') {
      // Either part of undock sequence or ground pickup - either way ignore
      return;
    }

    if (changeType === 'drop') {
      if (!tracking.holdingFromBag) return;

      tracking.holdingFromBag = false;
      tracking.count++;
      console.log(`[AntiGrief] ${username} dropped ${itemName} from bag (${tracking.count}/${GRIEF_DROP_THRESHOLD})`);

      if (tracking.count >= GRIEF_DROP_THRESHOLD) {
        console.log(`[AntiGrief] ${username} flagged!`);
        dropTracking[username] = { count: 0, justUndocked: false, holdingFromBag: false };
        sendGriefAlert(username, itemName, GRIEF_DROP_THRESHOLD);
      }
    }
  });

  // Keep polling for position/health data
  setInterval(async () => {
    await pollPlayers();
    await runAntiBagSwap();
    await runHealthMonitor();
  }, POLL_INTERVAL);
}

main().catch(console.error);
