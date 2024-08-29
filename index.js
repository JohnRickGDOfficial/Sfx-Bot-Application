// Load environment variables from .env file
require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const keepAlive = require('./keepAlive'); // Import the keep-alive script

// Start the keep-alive server
keepAlive();

// Retrieve variables from the environment
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, ACCEPT_ROLE_ID, MODERATION_CHANNEL_ID } = process.env;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Define the slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong and shows latency!'),
    new SlashCommandBuilder()
        .setName('sfx')
        .setDescription('Upload a sound effect file')
        .addAttachmentOption(option => 
            option.setName('file')
                .setDescription('The sound effect file (must be .ogg or .mp3 under 4MB)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('name')
                .setDescription('The name of the sound effect')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Register the slash commands with Discord
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing application (/) commands:', error);
    }
})();

// Event listener when the bot is ready
client.once('ready', () => {
    console.log('Bot is online!');
});

// Event listener for interactions
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isCommand()) {
            const { commandName } = interaction;

            if (commandName === 'ping') {
                await interaction.deferReply(); // Defer the reply
                const sent = await interaction.editReply({ content: 'Pong!', fetchReply: true });
                const latency = sent.createdTimestamp - interaction.createdTimestamp;
                const apiLatency = Math.round(client.ws.ping);

                await interaction.editReply(`Pong! Latency is ${latency}ms. API Latency is ${apiLatency}ms.`);
            } else if (commandName === 'sfx') {
                await interaction.deferReply(); // Defer the reply

                const file = interaction.options.getAttachment('file');
                const name = interaction.options.getString('name');

                // Validate file type and size
                const validTypes = ['audio/ogg', 'audio/mp3', 'audio/mpeg'];
                const maxSize = 4 * 1024 * 1024; // 4MB

                if (!validTypes.includes(file.contentType) || file.size > maxSize) {
                    await interaction.editReply({ content: 'Invalid file type or file size exceeds 4MB. Please upload a .ogg or .mp3 file under 4MB.', ephemeral: true });
                    return;
                }

                const targetChannelId = '1278602330295504916'; // Target channel ID
                const targetChannel = client.channels.cache.get(targetChannelId);

                if (targetChannel) {
                    try {
                        const acceptButton = new ButtonBuilder()
                            .setCustomId('accept_sfx')
                            .setLabel('Accept')
                            .setStyle(ButtonStyle.Success);

                        const denyButton = new ButtonBuilder()
                            .setCustomId('deny_sfx')
                            .setLabel('Deny')
                            .setStyle(ButtonStyle.Danger);

                        const row = new ActionRowBuilder().addComponents(acceptButton, denyButton);

                        // Send a message to the target channel
                        await targetChannel.send({
                            content: `New SFX Request from <@${interaction.user.id}>:\n**Name:** ${name}`,
                            files: [file.url], // Using the file URL to attach
                            components: [row],
                            allowedMentions: { parse: [] } // Prevent @everyone or @here mentions
                        });

                        // Confirm successful submission
                        await interaction.editReply({ content: 'Sound effect uploaded successfully! Please wait for moderation.', ephemeral: true });
                    } catch (error) {
                        console.error('Error sending SFX to target channel:', error);
                        await interaction.editReply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
                    }
                } else {
                    await interaction.editReply({ content: 'Failed to find the target channel. Please check the configuration.', ephemeral: true });
                }
            }
        } else if (interaction.isButton()) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const hasRole = member.roles.cache.has(ACCEPT_ROLE_ID);

            if (!hasRole) {
                await interaction.reply({ content: 'You do not have permission to use this button.', ephemeral: true });
                return;
            }

            const moderationChannel = client.channels.cache.get(MODERATION_CHANNEL_ID);
            if (!moderationChannel) {
                await interaction.reply({ content: 'Moderation channel not found.', ephemeral: true });
                return;
            }

            const originalMessage = await interaction.message.fetch();
            const sfxName = originalMessage.content.match(/Name:\s(.+)/)?.[1];
            const sfxFile = originalMessage.attachments.first()?.url;

            if (interaction.customId === 'accept_sfx') {
                await interaction.reply({ content: 'Please provide the name of the sound effect:', ephemeral: true });

                const filter = response => response.author.id === interaction.user.id;
                const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                const name = collected.first()?.content;

                if (name) {
                    await interaction.message.edit({ content: `Accepted! The sound effect has been forwarded.`, components: [] });

                    // Send the embed message for accepted SFX
                    await moderationChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#00FF00') // Green color for acceptance
                                .setTitle('SFX Accepted')
                                .addFields(
                                    { name: 'SFX Name', value: sfxName || name, inline: true }, // Use the provided name here
                                    { name: 'File', value: `[Download here](${sfxFile})`, inline: true }
                                )
                                .setFooter({ text: `Accepted by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                        ],
                        content: `Accepted SFX Request from <@${interaction.user.id}>`
                    });

                    // Notify the user who submitted the SFX
                    await client.users.fetch(interaction.user.id).then(user => {
                        user.send(`Your SFX request has been accepted! Thank you for your submission.`);
                    }).catch(error => {
                        console.error('Error sending DM to the user:', error);
                    });
                } else {
                    await interaction.editReply({ content: 'No name was provided. Please try again.', components: [] });
                }
            } else if (interaction.customId === 'deny_sfx') {
                await interaction.reply({ content: 'Please provide a reason for denying this SFX:', ephemeral: true });

                const filter = response => response.author.id === interaction.user.id;
                const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
                const reason = collected.first()?.content;

                if (reason) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000') // Red color for denial
                        .setTitle('SFX Denied')
                        .addFields(
                            { name: 'SFX Name', value: sfxName || 'Unknown', inline: true }, // Use the original name here
                            { name: 'File', value: `[Download here](${sfxFile})`, inline: true },
                            { name: 'Reason', value: reason }
                        )
                        .setFooter({ text: `Denied by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

                    await moderationChannel.send({
                        content: `Denied SFX Request from <@${interaction.user.id}>`,
                        embeds: [embed]
                    });

                    await interaction.editReply({ content: 'SFX request denied. The user has been informed.', components: [] });

                    // Notify the user who submitted the SFX
                    await client.users.fetch(interaction.user.id).then(user => {
                        user.send(`Your SFX request has been denied for the following reason: ${reason}`);
                    }).catch(error => {
                        console.error('Error sending DM to the user:', error);
                    });
                } else {
                    await interaction.editReply({ content: 'No reason was provided. Please try again.', components: [] });
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        await interaction.reply({ content: 'An error occurred while processing your request. Please try again later.', ephemeral: true });
    }
});

// Login to Discord with the app's token
client.login(DISCORD_TOKEN);
