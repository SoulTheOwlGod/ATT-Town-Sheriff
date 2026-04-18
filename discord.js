const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DISCORD_TOKEN } = require('C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/config.js');
const fs = require('fs');

const HISTORY_FILE = 'C:/Users/yehud/OneDrive/Desktop/Town Sheriff/Town Sheriff ATT/history.json';

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

let attConnection = null;
let flagsChannelId = null;

function setConnection(conn) {
  attConnection = conn;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function logEvent(username, type, detail) {
  const history = loadHistory();
  if (!history[username]) history[username] = [];
  history[username].push({
    type,
    detail,
    timestamp: new Date().toISOString()
  });
  saveHistory(history);
  console.log(`[History] Logged ${type} for ${username}`);
}

discordClient.once('clientReady', async () => {
  console.log('[Discord] Bot is online as ' + discordClient.user.tag);
  registerCommands();

  for (const guild of discordClient.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.name === 'flags-and-warnings');
    if (channel) {
      flagsChannelId = channel.id;
      console.log('[Discord] Auto-found flags channel:', channel.id);
      break;
    }
  }
});

async function registerCommands() {
  const command = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Sets up Town Sheriff channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const historyCommand = new SlashCommandBuilder()
    .setName('player')
    .setDescription('Look up a player history')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('ATT username')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  await discordClient.application.commands.set([command, historyCommand]);
  console.log('[Discord] Commands registered!');
}

discordClient.login(DISCORD_TOKEN);

async function sendGriefAlert(username, itemName, dropCount) {
  logEvent(username, 'flag', `Flagged for dropping ${itemName} ${dropCount} times`);

  if (!flagsChannelId) {
    console.log('[Discord] No flags channel set up yet! Run /setup first.');
    return;
  }

  const channel = await discordClient.channels.fetch(flagsChannelId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`warn_${username}`)
      .setLabel('Warn')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`jail_${username}`)
      .setLabel('Jail')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`cancel_${username}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: `⚠️ **${username}** could possibly be griefing! Dropped **${itemName}** ${dropCount} times in a row. Take action?`,
    components: [row]
  });
}

discordClient.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    await interaction.deferReply({ ephemeral: true });

    const existing = interaction.guild.channels.cache.find(
      c => c.name === 'flags-and-warnings'
    );

    if (existing) {
      flagsChannelId = existing.id;
      await interaction.editReply(`✅ Found existing flags-and-warnings channel: ${existing}`);
      return;
    }

    const channel = await interaction.guild.channels.create({
      name: 'flags-and-warnings',
      reason: 'Town Sheriff setup'
    });

    flagsChannelId = channel.id;
    await interaction.editReply(`✅ Setup complete! Flags and warnings will be sent to ${channel}`);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'player') {
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.options.getString('username');
    const history = loadHistory();
    const record = history[username];

    if (!record || record.length === 0) {
      await interaction.editReply(`✅ **${username}** has a clean record!`);
      return;
    }

    const lines = record.map((e, i) => {
      const date = new Date(e.timestamp).toLocaleDateString();
      const time = new Date(e.timestamp).toLocaleTimeString();
      return `${i + 1}. **${e.type.toUpperCase()}** — ${e.detail} (${date} ${time})`;
    }).join('\n');

    await interaction.editReply(`📋 **${username}'s history:**\n${lines}`);
    return;
  }

  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  const action = parts[0];
  const username = parts.slice(1).join('_');

  if (action === 'warn') {
    if (attConnection) {
      await attConnection.send(`player message ${username} "Warning: you are being flagged for griefing" 5`);
    }
    logEvent(username, 'warn', 'Warned for griefing');
    await interaction.update({ content: `⚠️ **${username}** has been warned.`, components: [] });
  }

  if (action === 'jail') {
    if (attConnection) {
      await attConnection.send(`player set-home ${username} -872.253,221.491,-989.694031`);
      await attConnection.send(`player teleport ${username} home`);
      await attConnection.send(`player set-home ${username} 0,0,0`);
      await attConnection.send(`player message ${username} "You have been jailed for griefing!" 5`);
    }
    logEvent(username, 'jail', 'Jailed for griefing');
    await interaction.update({ content: `🔒 **${username}** has been jailed.`, components: [] });
  }

  if (action === 'cancel') {
    await interaction.update({ content: `❌ Alert dismissed for **${username}**.`, components: [] });
  }
});

module.exports = { sendGriefAlert, setConnection };
