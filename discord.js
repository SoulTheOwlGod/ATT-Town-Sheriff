const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DISCORD_TOKEN } = require('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/config.js');
const fs = require('fs');

const HISTORY_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/history.json';
const LINKED_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/linked.json';

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let attConnection = null;
let flagsChannelId = null;
const pendingVerifications = {}; // { discordUserId: { attUsername, attId, code, expires } }

function setConnection(conn) { attConnection = conn; }

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

const AUTHORIZED_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/AuthorizedMods.json';

function loadAuthorized() {
  if (!fs.existsSync(AUTHORIZED_FILE)) return { Owners: [], Moderators: [] };
  try { return JSON.parse(fs.readFileSync(AUTHORIZED_FILE, 'utf-8')); }
  catch { return { Owners: [], Moderators: [] }; }
}

function isOwner(discordId) {
  return loadAuthorized().Owners.includes(discordId);
}

function isModerator(discordId) {
  const auth = loadAuthorized();
  return auth.Owners.includes(discordId) || auth.Moderators.includes(discordId);
}

function loadLinked() {
  if (!fs.existsSync(LINKED_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(LINKED_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveLinked(data) {
  fs.writeFileSync(LINKED_FILE, JSON.stringify(data, null, 2));
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function logEvent(username, type, detail) {
  const history = loadHistory();
  console.log('[History] Before save:', JSON.stringify(history[username]));
  if (!history[username]) history[username] = [];
  history[username].push({ type, detail, timestamp: new Date().toISOString() });
  console.log('[History] After push:', JSON.stringify(history[username]));
  saveHistory(history);
  console.log(`[History] Logged ${type} for ${username}`);
}

function buildProfileEmbed(username) {
  const history = loadHistory();
  const record = history[username];

  if (!record || record.length === 0) {
    return { content: `✅ **${username}** has a clean record!`, components: [] };
  }

  const lines = record.map((e, i) => {
    const date = new Date(e.timestamp).toLocaleDateString();
    const time = new Date(e.timestamp).toLocaleTimeString();
    return `${i + 1}. **${e.type.toUpperCase()}** — ${e.detail} (${date} ${time})`;
  }).join('\n');

  const components = [];
  const entries = record.slice(0, 25);
  for (let i = 0; i < entries.length; i += 5) {
    const row = new ActionRowBuilder();
    const chunk = entries.slice(i, i + 5);
    chunk.forEach((e, j) => {
      const index = i + j;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`remove_${username}_${index}`)
          .setLabel(`Remove #${index + 1}`)
          .setStyle(ButtonStyle.Danger)
      );
    });
    components.push(row);
  }

  return { content: `📋 **${username}'s history:**\n${lines}`, components };
}

discordClient.once('clientReady', async () => {
  console.log('[Discord] Bot is online as ' + discordClient.user.tag);
  registerCommands();
  for (const guild of discordClient.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.name === 'flags-and-warnings');
    if (channel) { flagsChannelId = channel.id; console.log('[Discord] Auto-found flags channel:', channel.id); break; }
  }
});

async function registerCommands() {
  const setupCmd = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Sets up Town Sheriff channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const playerCmd = new SlashCommandBuilder()
    .setName('player')
    .setDescription('Look up a player history')
    .addStringOption(o => o.setName('username').setDescription('ATT username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const profileCmd = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player profile with mod actions')
    .addStringOption(o => o.setName('username').setDescription('ATT username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const linkCmd = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your ATT account')
    .addStringOption(o => o.setName('username').setDescription('Your ATT username').setRequired(true))
    .addStringOption(o => o.setName('playerid').setDescription('Your ATT player ID').setRequired(true))
    .addStringOption(o => o.setName('code').setDescription('Verification code sent in-game').setRequired(false));

  await discordClient.application.commands.set([setupCmd, playerCmd, profileCmd, linkCmd]);
  console.log('[Discord] Commands registered!');
}

discordClient.login(DISCORD_TOKEN);

async function sendGriefAlert(username, itemName, dropCount, extraInfo = {}) {
  const { pos, chunk, playerId } = extraInfo;

  logEvent(username, 'flag', `Flagged for dropping ${itemName} ${dropCount} times`, {
    chunk,
    pos,
    playerId,
    timestamp: new Date().toISOString()
  });
  
  if (!flagsChannelId) { console.log('[Discord] No flags channel!'); return; }

  const channel = await discordClient.channels.fetch(flagsChannelId);

  // Find Town Moderator role in the guild
  const modRole = channel.guild.roles.cache.find(r => r.name === 'Town Moderator');
  const ping = modRole ? `<@&${modRole.id}>` : '';

  const history = loadHistory();
  const record = history[username] || [];
  const lastJailIndex = [...record].reverse().findIndex(e => e.type === 'jail' || e.type === 'unjail');
  const lastJailEvent = lastJailIndex >= 0 ? [...record].reverse()[lastJailIndex] : null;
  const isJailed = lastJailEvent?.type === 'jail';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`warn_${username}`).setLabel('Warn').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`jail_${username}`)
      .setLabel(isJailed ? 'Unjail' : 'Jail')
      .setStyle(isJailed ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`profile_${username}`).setLabel('Profile').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ignore_${username}`).setLabel('Ignore').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`moreinfo_${username}`).setLabel('More Info').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: `${ping} ⚠️ **${username}** could possibly be griefing! Dropped **${itemName}** ${dropCount} times in a row. Take action?`,
    components: [row]
  });
}

discordClient.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const existing = interaction.guild.channels.cache.find(c => c.name === 'flags-and-warnings');
      if (existing) { flagsChannelId = existing.id; await interaction.editReply(`✅ Found existing channel: ${existing}`); return; }
      const channel = await interaction.guild.channels.create({ name: 'flags-and-warnings', reason: 'Town Sheriff setup' });
      flagsChannelId = channel.id;
      await interaction.editReply(`✅ Setup complete! ${channel}`);
      return;
    }

    if (interaction.commandName === 'player') {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username');
      const history = loadHistory();
      const record = history[username];
      if (!record || record.length === 0) { await interaction.editReply(`✅ **${username}** has a clean record!`); return; }
      const lines = record.map((e, i) => {
        const date = new Date(e.timestamp).toLocaleDateString();
        const time = new Date(e.timestamp).toLocaleTimeString();
        return `${i + 1}. **${e.type.toUpperCase()}** — ${e.detail} (${date} ${time})`;
      }).join('\n');
      await interaction.editReply(`📋 **${username}'s history:**\n${lines}`);
      return;
    }

    if (interaction.commandName === 'profile') {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username');
      const profileData = buildProfileEmbed(username);
      await interaction.editReply(profileData);
      return;
    }

    if (interaction.commandName === 'link') {
      await interaction.deferReply({ ephemeral: true });
      const attUsername = interaction.options.getString('username');
      const attId = interaction.options.getString('playerid');
      const code = interaction.options.getString('code');
      const discordId = interaction.user.id;

      // Step 2 - verifying with code
      if (code) {
        const pending = pendingVerifications[discordId];

        if (!pending) {
          await interaction.editReply(`❌ No pending verification found. Run \`/link\` without a code first.`);
          return;
        }

        if (Date.now() > pending.expires) {
          delete pendingVerifications[discordId];
          await interaction.editReply(`❌ Your verification code expired. Please run \`/link\` again.`);
          return;
        }

        if (pending.attUsername !== attUsername || pending.attId !== attId) {
          await interaction.editReply(`❌ Username or ID doesn't match your pending verification.`);
          return;
        }

        if (code.toUpperCase() !== pending.code) {
          await interaction.editReply(`❌ Incorrect code. Please try again.`);
          return;
        }

        const linked = loadLinked();
        linked[discordId] = { attUsername, attId, linkedAt: new Date().toISOString() };
        saveLinked(linked);
        delete pendingVerifications[discordId];

        await interaction.editReply(`✅ Successfully linked! Your Discord is now linked to ATT account **${attUsername}**.`);
        return;
      }

      // Step 1 - send code in game
      if (!attConnection) {
        await interaction.editReply(`❌ Bot is not connected to the ATT server right now.`);
        return;
      }

      const verifyCode = generateCode();
      pendingVerifications[discordId] = {
        attUsername,
        attId,
        code: verifyCode,
        expires: Date.now() + 5 * 60 * 1000
      };

      await attConnection.send(`player message ${attUsername} "Your Eldervale Discord verification code is: ${verifyCode}" 10`);
      await interaction.editReply(`📨 A verification code has been sent to **${attUsername}** in-game.\nRun \`/link ${attUsername} ${attId} <code>\` to complete linking.\n\nCode expires in 5 minutes.`);
      return;
    }
  }

  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  const action = parts[0];
  const username = parts.slice(1, action === 'remove' ? -1 : undefined).join('_');

  if (action === 'warn') {
    if (attConnection) await attConnection.send(`player message ${username} "Warning: you are being flagged for griefing" 5`);
    logEvent(username, 'warn', 'Warned for griefing');
    await interaction.update({ content: `⚠️ **${username}** has been warned.`, components: [] });
  }

  if (action === 'jail') {
    const history = loadHistory();
    const record = history[username] || [];
    const lastJailIndex = [...record].reverse().findIndex(e => e.type === 'jail' || e.type === 'unjail');
    const lastJailEvent = lastJailIndex >= 0 ? [...record].reverse()[lastJailIndex] : null;
    const isJailed = lastJailEvent?.type === 'jail';

    if (isJailed) {
      if (attConnection) {
        await attConnection.send(`player set-home ${username} 0,0,0`);
        await attConnection.send(`player teleport ${username} home`);
        await attConnection.send(`player set-home ${username} 0,0,0`);
        await attConnection.send(`player message ${username} "You have been released from jail." 5`);
      }
      logEvent(username, 'unjail', 'Released from jail');
      await interaction.update({ content: `🔓 **${username}** has been released from jail.`, components: [] });
    } else {
      if (attConnection) {
        await attConnection.send(`player set-home ${username} -872.253,221.491,-989.694031`);
        await attConnection.send(`player teleport ${username} home`);
        await attConnection.send(`player set-home ${username} 0,0,0`);
        await attConnection.send(`player message ${username} "You have been jailed for griefing!" 5`);
      }
      logEvent(username, 'jail', 'Jailed for griefing');
      await interaction.update({ content: `🔒 **${username}** has been jailed.`, components: [] });
    }
  }

  if (action === 'ignore') {
    await interaction.message.delete();
  }

  if (action === 'profile') {
    const profileData = buildProfileEmbed(username);
    await interaction.reply({ ...profileData, ephemeral: true });
  }

  if (action === 'remove') {
    const index = parseInt(parts[parts.length - 1]);
    const targetUsername = parts.slice(1, -1).join('_');
    const history = loadHistory();
    if (history[targetUsername]) {
      history[targetUsername].splice(index, 1);
      saveHistory(history);
    }
    const profileData = buildProfileEmbed(targetUsername);
    await interaction.update(profileData);
  }
});

module.exports = { sendGriefAlert, setConnection };
