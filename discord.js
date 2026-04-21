const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { DISCORD_TOKEN } = require('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/config.js');
const fs = require('fs');

const HISTORY_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/history.json';
const LINKED_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/linked.json';
const ERROR_LOG_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/errorlog.json';
const DOWNTIME_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/downtime.json';

const BOT_START_TIME = Date.now();

// ===== DEV ACCESS =====
const DEV_IDS = ['1066510611959251025', '753449987425304677']; // burntp0tat0, _im1hatedsoul_

function isDev(discordId) {
  return DEV_IDS.includes(discordId);
}

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let attConnection = null;
let flagsChannelId = null;
const pendingVerifications = {};

function setConnection(conn) { attConnection = conn; }

// ===== ERROR LOG =====
function loadErrorLog() {
  if (!fs.existsSync(ERROR_LOG_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ERROR_LOG_FILE, 'utf-8')); }
  catch { return []; }
}

function saveErrorLog(data) {
  fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(data, null, 2));
}

function logError(source, message) {
  const log = loadErrorLog();
  log.push({ source, message, timestamp: new Date().toISOString() });
  // Keep only the last 50 errors
  if (log.length > 50) log.splice(0, log.length - 50);
  saveErrorLog(log);
  console.error(`[ERROR][${source}] ${message}`);
}

// Intercept uncaught errors and log them
process.on('uncaughtException', (err) => logError('uncaughtException', err.message));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err?.message || String(err)));

// ===== DOWNTIME =====
function loadDowntime() {
  if (!fs.existsSync(DOWNTIME_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(DOWNTIME_FILE, 'utf-8')); }
  catch { return null; }
}

function saveDowntime(data) {
  fs.writeFileSync(DOWNTIME_FILE, JSON.stringify(data, null, 2));
}

// ===== HISTORY =====
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

const SETTINGS_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff Discord/serversettings.json';


function getDefaultSettings() {
  return {
    antiGrief: false,
    antiDupe: false,
    antiBagSwap: false,
    discordAlerts: false,
    discordBot: true
  };
}

function loadSettings(guildId) {
  if (!fs.existsSync(SETTINGS_FILE)) return getDefaultSettings();
  try {
    const all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    return all[guildId] || getDefaultSettings();
  } catch { return getDefaultSettings(); }
}

function saveSettings(guildId, data) {
  let all = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try { all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { }
  }
  all[guildId] = data;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2));
}

function buildSettingsRows(settings) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setting_antiGrief')
      .setLabel(`Anti Grief — ${settings.antiGrief ? 'ON' : 'OFF'}`)
      .setStyle(settings.antiGrief ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('setting_antiDupe')
      .setLabel(`Anti Dupe — ${settings.antiDupe ? 'ON' : 'OFF'}`)
      .setStyle(settings.antiDupe ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('setting_antiBagSwap')
      .setLabel(`Anti Bag Swap — ${settings.antiBagSwap ? 'ON' : 'OFF'}`)
      .setStyle(settings.antiBagSwap ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setting_discordAlerts')
      .setLabel(`Discord Alerts — ${settings.discordAlerts ? 'ON' : 'OFF'}`)
      .setStyle(settings.discordAlerts ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('setting_discordBot')
      .setLabel(`Discord Bot — ${settings.discordBot ? 'ON' : 'OFF'}`)
      .setStyle(settings.discordBot ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  return [row1, row2];
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function logEvent(username, type, detail) {
  const history = loadHistory();
  if (!history[username]) history[username] = [];
  history[username].push({ type, detail, timestamp: new Date().toISOString() });
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

function getUptime() {
  const totalSeconds = Math.floor((Date.now() - BOT_START_TIME) / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return { hrs, mins, secs };
}

function getDowntimeDisplay() {
  const downtime = loadDowntime();
  if (!downtime) return '`No Scheduled Downtimes`';
  return `\`${downtime.display} PST\``;
}

// ===== READY =====
discordClient.once('clientReady', async () => {
  console.log('[Discord] Bot is online as ' + discordClient.user.tag);
  registerCommands();
  for (const guild of discordClient.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.name === 'flags-and-warnings');
    if (channel) { flagsChannelId = channel.id; console.log('[Discord] Auto-found flags channel:', channel.id); break; }
  }
  for (const guild of discordClient.guilds.cache.values()) {
    await setBotRoleColor(guild);
  }
  const flagFile = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/restarting.flag';
  if (fs.existsSync(flagFile)) {
    const channelId = fs.readFileSync(flagFile, 'utf-8').trim();
    fs.unlinkSync(flagFile);
    try {
      const channel = await discordClient.channels.fetch(channelId);
      await channel.send(`✅ **Town Sheriff bot successfully restarted!**`);
    } catch { }
  }
});

discordClient.on('guildCreate', async (guild) => {
  console.log(`[Discord] Joined new server: ${guild.name}`);
  await setBotRoleColor(guild);
});

async function setBotRoleColor(guild) {
  try {
    const botMember = guild.members.cache.get(discordClient.user.id)
      || await guild.members.fetch(discordClient.user.id);
    const botRole = botMember.roles.cache.find(r => r.managed);
    if (!botRole) { console.log(`[RoleColor] No managed role found in ${guild.name}`); return; }
    if (botRole.color !== 0xC2B280) {
      await botRole.setColor(0xC2B280);
      console.log(`[RoleColor] Set role color in ${guild.name}`);
    }
  } catch (err) {
    console.error(`[RoleColor] Failed in ${guild.name}:`, err.message);
  }
}

// ===== REGISTER COMMANDS =====
async function registerCommands() {
  const setupCmd = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Sets up Town Sheriff channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const profileCmd = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player profile with mod actions')
    .addStringOption(o => o.setName('username').setDescription('ATT username').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const serverSettingsCmd = new SlashCommandBuilder()
    .setName('serversettings')
    .setDescription('Use this command to configure the bot settings for your server.');

  const linkCmd = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your ATT account')
    .addStringOption(o => o.setName('username').setDescription('Your ATT username').setRequired(true))
    .addStringOption(o => o.setName('playerid').setDescription('Your ATT player ID').setRequired(true))
    .addStringOption(o => o.setName('code').setDescription('Verification code sent in-game').setRequired(false));

  const discordInviteCmd = new SlashCommandBuilder()
    .setName('discordinvite')
    .setDescription('Get the link to join the Town Sheriff Discord server');

  const helpCmd = new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available commands and what they do');

  const suggestCmd = new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Suggest an idea for the server')
    .addStringOption(o => o.setName('idea').setDescription('Your idea').setRequired(false));

  const pingCmd = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s ping and uptime stats');

  // ===== DEV COMMANDS =====
  const devRestartCmd = new SlashCommandBuilder()
    .setName('devbotrestart')
    .setDescription('[DEV ONLY] Restarts the Town Sheriff bot');

  const devServerListCmd = new SlashCommandBuilder()
    .setName('devserverlist')
    .setDescription('[DEV ONLY] List all Discord servers using Town Sheriff');

  const devLeaveServerCmd = new SlashCommandBuilder()
    .setName('devleaveserver')
    .setDescription('[DEV ONLY] Make the bot leave a server by ID')
    .addStringOption(o => o.setName('serverid').setDescription('The Discord server ID to leave').setRequired(true));

  const devScheduleDowntimeCmd = new SlashCommandBuilder()
    .setName('devscheduledowntime')
    .setDescription('[DEV ONLY] Schedule a downtime displayed on /ping')
    .addStringOption(o => o.setName('date').setDescription('Date of downtime e.g. Jan 20').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('Time of downtime e.g. 3:00 PM').setRequired(true));

  const devRemoveDowntimeCmd = new SlashCommandBuilder()
    .setName('devscheduledowntimeremove')
    .setDescription('[DEV ONLY] Remove the scheduled downtime from /ping');

  const devErrorLogCmd = new SlashCommandBuilder()
    .setName('deverrorlog')
    .setDescription('[DEV ONLY] View recent bot error logs');

  await discordClient.application.commands.set([
    setupCmd, profileCmd, linkCmd, serverSettingsCmd,
    discordInviteCmd, helpCmd, suggestCmd, pingCmd,
    devRestartCmd, devServerListCmd, devLeaveServerCmd,
    devScheduleDowntimeCmd, devErrorLogCmd
  ]);
  console.log('[Discord] Commands registered!');
}

discordClient.login(DISCORD_TOKEN);

// ===== GRIEF ALERT =====
async function sendGriefAlert(username, itemName, dropCount, extraInfo = {}) {
  const { pos, chunk, playerId } = extraInfo;

  logEvent(username, 'flag', `Flagged for dropping ${itemName} ${dropCount} times`);

  if (!flagsChannelId) { console.log('[Discord] No flags channel!'); return; }

  const channel = await discordClient.channels.fetch(flagsChannelId);
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

// ===== INTERACTIONS =====
discordClient.on('interactionCreate', async interaction => {
  // ===== DISABLED BOT CHECK =====
  if (interaction.guildId) {
    const settings = loadSettings(interaction.guildId);
    if (!settings.discordBot && interaction.isChatInputCommand() && interaction.commandName !== 'serversettings') {
      await interaction.reply({
        content: `This server has disabled commands. Run \`/serversettings\` and enable "Discord Bot" to reactivate commands.`,
        ephemeral: true
      });
      return;
    }
  }

  if (interaction.commandName === 'serversettings') {
    const settings = loadSettings(interaction.guildId);
    await interaction.reply({
      content: '⚙️ **Server Settings**\nUse this command to configure the bot settings for your server.',
      components: buildSettingsRows(settings),
      ephemeral: true
    });
    return;
  }

  if (interaction.isChatInputCommand()) {

    // Dev command guard
    const devCommands = ['devbotrestart', 'devserverlist', 'devleaveserver', 'devscheduledowntime', 'devscheduledowntimeremove', 'deverrorlog'];
    if (devCommands.includes(interaction.commandName)) {
      if (!isDev(interaction.user.id)) {
        await interaction.reply({ content: `🚫 You don't have permission to use dev commands.`, ephemeral: true });
        return;
      }
    }

    // ===== SETUP =====
    if (interaction.commandName === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const existing = interaction.guild.channels.cache.find(c => c.name === 'flags-and-warnings');
      if (existing) { flagsChannelId = existing.id; await interaction.editReply(`✅ Found existing channel: ${existing}`); return; }
      const channel = await interaction.guild.channels.create({ name: 'flags-and-warnings', reason: 'Town Sheriff setup' });
      flagsChannelId = channel.id;
      await interaction.editReply(`✅ Setup complete! ${channel}`);
      return;
    }

    // ===== PROFILE =====
    if (interaction.commandName === 'profile') {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username');
      const profileData = buildProfileEmbed(username);
      await interaction.editReply(profileData);
      return;
    }

    // ===== LINK =====
    if (interaction.commandName === 'link') {
      await interaction.deferReply({ ephemeral: true });
      const attUsername = interaction.options.getString('username');
      const attId = interaction.options.getString('playerid');
      const code = interaction.options.getString('code');
      const discordId = interaction.user.id;

      if (code) {
        const pending = pendingVerifications[discordId];
        if (!pending) { await interaction.editReply(`❌ No pending verification found. Run \`/link\` without a code first.`); return; }
        if (Date.now() > pending.expires) { delete pendingVerifications[discordId]; await interaction.editReply(`❌ Your verification code expired. Please run \`/link\` again.`); return; }
        if (pending.attUsername !== attUsername || pending.attId !== attId) { await interaction.editReply(`❌ Username or ID doesn't match your pending verification.`); return; }
        if (code.toUpperCase() !== pending.code) { await interaction.editReply(`❌ Incorrect code. Please try again.`); return; }

        const linked = loadLinked();
        linked[discordId] = { attUsername, attId, linkedAt: new Date().toISOString() };
        saveLinked(linked);
        delete pendingVerifications[discordId];
        await interaction.editReply(`✅ Successfully linked! Your Discord is now linked to ATT account **${attUsername}**.`);
        return;
      }

      if (!attConnection) { await interaction.editReply(`❌ Bot is not connected to the ATT server right now.`); return; }

      const verifyCode = generateCode();
      pendingVerifications[discordId] = { attUsername, attId, code: verifyCode, expires: Date.now() + 5 * 60 * 1000 };
      await attConnection.send(`player message ${attUsername} "Your Town Sheriff verification code is: ${verifyCode}" 10`);
      await interaction.editReply(`📨 A verification code has been sent to **${attUsername}** in-game.\nRun \`/link ${attUsername} ${attId} <code>\` to complete linking.\n\nCode expires in 5 minutes.`);
      return;
    }

    // ===== DISCORD INVITE =====
    if (interaction.commandName === 'discordinvite') {
      await interaction.reply({
        content: `## 🤠 Join the Town Sheriff Discord!\n> Click the link below to join our community server:\n> **https://discord.gg/cMRRUPYfvG**`,
        ephemeral: false
      });
      return;
    }

    // ===== HELP =====
    if (interaction.commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('🤠 Town Sheriff — Command List')
        .setColor(0xF5A623)
        .setDescription('Here are all available commands for the Town Sheriff bot:')
        .addFields(
          { name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📢  Public Commands', value: '\u200b' },
          { name: '`/discordinvite`', value: 'Get the invite link to join the Town Sheriff Discord server.' },
          { name: '`/suggest <idea>`', value: 'Want to suggest a feature or idea? This will point you to the right place.' },
          { name: '`/ping`', value: 'Check the bot\'s current ping and how long it\'s been online.' },
          { name: '`/link <username> <playerid>`', value: 'Link your Discord account to your ATT in-game account. A verification code will be sent to you in-game.' },
          { name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒  Moderator / Owner Commands', value: '\u200b' },
          { name: '`/setup`', value: 'Creates (or finds) the **#flags-and-warnings** channel used for grief alerts. *(Admin only)*' },
          { name: '`/profile <username>`', value: 'View a player\'s full profile with buttons to remove individual entries. *(Admin only)*' },
          { name: '`/serversettings`', value: 'Use this command to configure the bot settings for your server.' },
          { name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚙️  Dev Commands', value: '\u200b' },
          { name: '`/devbotrestart`', value: 'Restart the bot process.' },
          { name: '`/devserverlist`', value: 'List all Discord servers using Town Sheriff.' },
          { name: '`/devleaveserver <id>`', value: 'Make the bot leave a server by ID.' },
          { name: '`/devscheduledowntime`', value: 'Schedule a downtime shown on `/ping`.' },
          { name: '`/devscheduledowntimeremove`', value: 'Clear the scheduled downtime from `/ping`.' },
          { name: '`/deverrorlog`', value: 'View recent bot error logs.' }
        )
        .setFooter({ text: 'Town Sheriff Bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== SUGGEST =====
    if (interaction.commandName === 'suggest') {
      await interaction.reply({
        content: `## 💡 Got an idea?\nTo suggest an idea, join the Discord and post in our suggestions channel:\n> **https://discord.gg/cMRRUPYfvG**`,
        ephemeral: true
      });
      return;
    }

    // ===== PING =====
    if (interaction.commandName === 'ping') {
      const sent = await interaction.deferReply({ fetchReply: true });
      const ping = sent.createdTimestamp - interaction.createdTimestamp;
      const wsPing = discordClient.ws.ping;
      const { hrs, mins, secs } = getUptime();

      const embed = new EmbedBuilder()
        .setTitle('🤠 Town Sheriff Bot Stats')
        .setColor(0x57F287)
        .addFields(
          { name: '🏓  Ping', value: `\`${ping}ms\``, inline: true },
          { name: '🔌  WebSocket', value: `\`${wsPing}ms\``, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '⏱️  Online For', value: `\`${hrs}hrs ${mins}min ${secs}sec\``, inline: true },
          { name: '🗓️  Next Scheduled Downtime', value: getDowntimeDisplay(), inline: true }
        )
        .setFooter({ text: 'Town Sheriff Bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === 'devbotrestart') {
      await interaction.reply({ content: `🔄 Restarting the bot now...`, ephemeral: true });
      console.log(`[DEV] Bot restart triggered by ${interaction.user.tag}`);

      setTimeout(async () => {
        fs.writeFileSync('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/restarting.flag', interaction.channelId);
        process.exit(0);
      }, 1500);
      return;
    }

    // ===== DEV: SERVER LIST =====
    if (interaction.commandName === 'devserverlist') {
      await interaction.deferReply({ ephemeral: true });
      const guilds = discordClient.guilds.cache;

      if (guilds.size === 0) { await interaction.editReply(`📋 The bot is not in any servers.`); return; }

      const guildList = [...guilds.values()].slice(0, 25);

      const embed = new EmbedBuilder()
        .setTitle('🤠 Town Sheriff — Server List')
        .setColor(0xF5A623)
        .setDescription(`Bot is active in **${guilds.size}** server(s).\n\nPress a button to generate a one-time invite link.`)
        .addFields({ name: 'Servers', value: guildList.map((g, i) => `${i + 1}. **${g.name}** — ${g.memberCount} members`).join('\n') })
        .setFooter({ text: 'Town Sheriff Bot • Dev Only' })
        .setTimestamp();

      const components = [];
      for (let i = 0; i < guildList.length; i += 5) {
        const row = new ActionRowBuilder();
        guildList.slice(i, i + 5).forEach(g => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`serverlink_${g.id}`)
              .setLabel(g.name.slice(0, 20))
              .setStyle(ButtonStyle.Primary)
          );
        });
        components.push(row);
      }

      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // ===== DEV: LEAVE SERVER =====
    if (interaction.commandName === 'devleaveserver') {
      await interaction.deferReply({ ephemeral: true });
      const serverId = interaction.options.getString('serverid');
      const guild = discordClient.guilds.cache.get(serverId);

      if (!guild) {
        await interaction.editReply(`❌ Bot is not in a server with ID \`${serverId}\`.`);
        return;
      }

      const guildName = guild.name;
      try {
        await guild.leave();
        console.log(`[DEV] Left server: ${guildName} (${serverId}) — triggered by ${interaction.user.tag}`);
        await interaction.editReply(`✅ Successfully left **${guildName}**.`);
      } catch (err) {
        await interaction.editReply(`❌ Failed to leave **${guildName}**: ${err.message}`);
      }
      return;
    }

    // ===== DEV: SCHEDULE DOWNTIME =====
    if (interaction.commandName === 'devscheduledowntime') {
      const date = interaction.options.getString('date');
      const time = interaction.options.getString('time');
      const display = `${date} at ${time}`;

      saveDowntime({ display, setBy: interaction.user.tag, setAt: new Date().toISOString() });

      await interaction.reply({
        content: `✅ Downtime scheduled!\n> **${display} PST**\n\nThis will now appear on \`/ping\`. To clear it, use \`/devscheduledowntime\` and type \`none\` for the date.`,
        ephemeral: true
      });

      if (date.toLowerCase() === 'none') {
        saveDowntime(null);
        await interaction.editReply(`✅ Scheduled downtime cleared. \`/ping\` will now show "No Scheduled Downtimes".`);
      }
      return;
    }

    // ===== DEV: REMOVE DOWNTIME =====
    if (interaction.commandName === 'devscheduledowntimeremove') {
      saveDowntime(null);
      await interaction.reply({ content: `✅ Scheduled downtime cleared. \`/ping\` will now show "No Scheduled Downtimes".`, ephemeral: true });
      return;
    }

    // ===== DEV: ERROR LOG =====
    if (interaction.commandName === 'deverrorlog') {
      await interaction.deferReply({ ephemeral: true });
      const log = loadErrorLog();

      if (log.length === 0) {
        await interaction.editReply({ content: `✅ No errors logged.`, components: [] });
        return;
      }

      // Show most recent 20 errors
      const recent = log.slice(-20).reverse();
      const lines = recent.map((e, i) => {
        const date = new Date(e.timestamp).toLocaleDateString();
        const time = new Date(e.timestamp).toLocaleTimeString();
        return `${i + 1}. **[${e.source}]** ${e.message}\n   *(${date} ${time})*`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('🚨 Town Sheriff — Error Log')
        .setColor(0xED4245)
        .setDescription(lines.slice(0, 4000)) // this is the Discord embed description limit
        .setFooter({ text: `${log.length} total errors on record • Town Sheriff Bot • Dev Only` })
        .setTimestamp();

      const clearRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('clearerrorlog')
          .setLabel('🗑️ Clear All Logs')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({ embeds: [embed], components: [clearRow] });
      return;
    }
  }

  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  const action = parts[0];

  // ===== CLEAR ERROR LOG BUTTON =====
  if (interaction.customId === 'clearerrorlog') {
    if (!isDev(interaction.user.id)) {
      await interaction.reply({ content: `🚫 You don't have permission to do this.`, ephemeral: true });
      return;
    }
    saveErrorLog([]);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚨 Town Sheriff — Error Log')
          .setColor(0x57F287)
          .setDescription('✅ All error logs have been cleared.')
          .setFooter({ text: 'Town Sheriff Bot • Dev Only' })
          .setTimestamp()
      ],
      components: []
    });
    return;
  }

  // ===== SERVER LINK BUTTON =====
  if (action === 'serverlink') {
    if (!isDev(interaction.user.id)) {
      await interaction.reply({ content: `🚫 You don't have permission to use this.`, ephemeral: true });
      return;
    }

    const guildId = parts[1];
    try {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) { await interaction.reply({ content: `❌ Could not find that server.`, ephemeral: true }); return; }

      const targetChannel = guild.channels.cache.find(
        c => c.isTextBased() && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreateInstantInvite)
      );

      if (!targetChannel) {
        await interaction.reply({ content: `❌ **${guild.name}** — Bot doesn't have permission to create invites here.`, ephemeral: true });
        return;
      }

      const invite = await targetChannel.createInvite({ maxAge: 300, maxUses: 1, reason: 'Dev server list lookup' });
      await interaction.reply({
        content: `🔗 **${guild.name}**\n> ${invite.url}\n\n*Expires in 5 minutes, single use.*`,
        ephemeral: true
      });
    } catch (err) {
      console.error('[DevServerList] Failed to create invite:', err.message);
      await interaction.reply({ content: `❌ Failed to generate invite: ${err.message}`, ephemeral: true });
    }
    return;
  }

  // ===== STANDARD BUTTON HANDLERS =====
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

  if (action === 'setting') {
    const settingKey = parts[1];
    const settings = loadSettings(interaction.guildId);
    settings[settingKey] = !settings[settingKey];
    saveSettings(interaction.guildId, settings);

    await interaction.update({
      content: '⚙️ **Server Settings**\nUse this command to configure the bot settings for your server.',
      components: buildSettingsRows(settings)
    });
  }

});

module.exports = { sendGriefAlert, setConnection, loadSettings };
