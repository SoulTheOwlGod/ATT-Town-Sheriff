const { Client } = require("att-client");
const { myUserConfig } = require("./config.js");
const { sendGriefAlert, setConnection } = require('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff Discord/discord.js');

const client = new Client(myUserConfig);

// ===== CONFIG =====
const POLL_INTERVAL = 500;
const BAG_SWAP_DISTANCE = 3;
const GRIEF_DROP_THRESHOLD = 10;
const RETRY_INTERVAL = 30000; // How long to wait between reconnect attempts (ms)

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
let chunkKillCooldowns = {};
let pollInterval = null;

// ===== CONFIG =====
const BANNED_CHUNKS = ['domain'];

// ===== MAIN POLL =====
async function pollPlayers() {
  try {
    const res = await connection.send('player list-detailed');
    playerData = res?.data?.Result || [];
  } catch (err) {
    console.error('[Poll] Error:', err.message);
  }
}

// ===== ANTI BAG SWAP =====
async function runAntiBagSwap() {
  const inventories = {};
  for (const player of playerData) {
    const username = player.username || player.Username;
    const invRes = await connection.send(`player inventory ${username}`);
    inventories[username] = invRes?.data?.Result?.[0];
  }

  for (const swapper of playerData) {
    const swapperName = swapper.username || swapper.Username;
    const swapperInv = inventories[swapperName];
    if (!swapperInv) continue;

    const holdingBagInHand =
      (swapperInv.RightHand?.Name || '').toLowerCase().includes('bag') ||
      (swapperInv.LeftHand?.Name || '').toLowerCase().includes('bag');
    if (!holdingBagInHand) continue;

    const handPos = (swapperInv.RightHand?.Name || '').toLowerCase().includes('bag')
      ? swapper.rightHandPosition
      : swapper.leftHandPosition;
    if (!handPos) continue;

    for (const victim of playerData) {
      const victimName = victim.username || victim.Username;
      if (victimName === swapperName) continue;

      const victimForward = victim.headForward || victim.HeadForward;
      if (!victimForward) continue;

      const victimPos = victim.position || victim.Position;
      if (!victimPos) continue;

      const victimBackPos = [
        victimPos[0] - (victimForward[0] * 0.5),
        victimPos[1] + 0.8,
        victimPos[2] - (victimForward[2] * 0.5)
      ];

      const dist = Math.sqrt(
        Math.pow(handPos[0] - victimBackPos[0], 2) +
        Math.pow(handPos[1] - victimBackPos[1], 2) +
        Math.pow(handPos[2] - victimBackPos[2], 2)
      );

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

// ===== ANTI DUPE =====
async function runAntiDupe() {
  for (const player of playerData) {
    const username = player.username || player.Username;
    const chunk = (player.chunk || player.Chunk || '').toLowerCase();

    const isInBannedChunk = BANNED_CHUNKS.some(banned => chunk.includes(banned));
    if (!isInBannedChunk) continue;

    if (chunkKillCooldowns[username]) continue;
    chunkKillCooldowns[username] = true;

    console.log(`[AntiDupe] ${username} entered banned chunk: ${chunk}`);
    await connection.send(`player set-stat ${username} health 100`);
    await connection.send(`player kill ${username}`);
    await connection.send(`player message ${username} "You have entered a restricted area and have been flagged" 10`);

    sendGriefAlert(username, `Entered restricted chunk: ${chunk}`, 1);

    setTimeout(() => {
      delete chunkKillCooldowns[username];
    }, 5000);
  }
}

// ===== HEALTH MONITOR =====
async function runHealthMonitor() {
  for (const player of playerData) {
    const username = player.username || player.Username;
    const health = player.health || player.Health;
    const lastHealth = playerHealth[username];
    playerHealth[username] = health;

    if (lastHealth === undefined) continue;

    const takingDamage = health < lastHealth;
  }
}

// ===== RESET STATE ON DISCONNECT =====
function resetState() {
  playerData = [];
  dropTracking = {};
  playerHealth = {};
  bagSwapCooldowns = {};
  chunkKillCooldowns = {};
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  connection = null;
  setConnection(null);
}

// ===== CONNECT TO SERVER (with retry) =====
async function connectToServer() {
  while (true) {
    try {
      console.log('[Bot] Attempting to connect to ATT server...');
      connection = await client.openServerConnection(1704646669);
      console.log('[Bot] Connected to server!');
      setConnection(connection);
      startListeners();
      return; // Connected — exit the retry loop
    } catch (err) {
      console.error(`[Bot] Failed to connect: ${err.message}`);
      console.log(`[Bot] Server may be offline. Retrying in ${RETRY_INTERVAL / 1000} seconds...`);
      resetState();
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }
  }
}

// ===== SETUP LISTENERS & POLL =====
function startListeners() {
  // Inventory event listener
  connection.subscribe('InventoryChanged', async (event) => {
    const username = event.data?.User?.username || event.data?.User?.Username;
    const changeType = (event.data?.ChangeType || '').toLowerCase();
    const itemName = event.data?.ItemName || '';

    if (!username) return;

    console.log(`[InvDebug] ${username} | changeType: "${changeType}" | item: "${itemName}"`);

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
      tracking.holdingFromBag = false;
      tracking.count++;
      console.log(`[AntiGrief] ${username} dropped ${itemName} from bag (${tracking.count}/${GRIEF_DROP_THRESHOLD})`);

      if (tracking.count >= GRIEF_DROP_THRESHOLD) {
        const player = playerData.find(p => (p.username || p.Username) === username);
        const pos = player?.position || player?.Position;
        const chunk = player?.chunk || player?.Chunk || 'Unknown';
        const playerId = player?.id || player?.Id || 'Unknown';

        dropTracking[username] = { count: 0, holdingFromBag: false, justUndocked: false };
        sendGriefAlert(username, itemName, GRIEF_DROP_THRESHOLD, { pos, chunk, playerId });
        return;
      }
      return;
    }

    if (changeType === 'dock') {
      tracking.holdingFromBag = false;
      tracking.justUndocked = false;
      console.log(`[Dock] ${username} put ${itemName} back in bag`);
      return;
    }
  });

  // Listen for server disconnect and reconnect automatically
  connection.on('disconnect', async () => {
    console.warn('[Bot] Disconnected from ATT server!');
    resetState();
    console.log(`[Bot] Attempting to reconnect in ${RETRY_INTERVAL / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    await connectToServer();
  });

  // Start polling
  pollInterval = setInterval(async () => {
    if (!connection) return;
    try {
      await pollPlayers();
      await runAntiBagSwap();
      await runHealthMonitor();
      await runAntiDupe();
    } catch (err) {
      console.error('[PollLoop] Unexpected error:', err.message);
    }
  }, POLL_INTERVAL);
}

// ===== STARTUP =====
async function main() {
  await client.start();
  console.log('[Bot] Logged in as ' + myUserConfig.username + '!');
  await connectToServer();
}

main().catch(console.error);
