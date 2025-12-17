const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const { tokens, spam } = config;
const clients = [];

const BATCH_SIZE = 5;        // Bots por tanda (Railway Free)
const BATCH_DELAY = 1000;    // Espera entre tandas (ms)

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient(token, index) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Channel]
    });

    client.once('ready', () => {
        console.log(`✅ Bot ${index + 1} conectado como ${client.user.tag}`);
    });

    if (index === 0) {
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (!message.content.startsWith('.spam')) return;

            const args = message.content.slice(5).trim().split(/\s+/);
            const userId = args[0];

            if (!userId || !/^\d{17,20}$/.test(userId)) {
                return message.reply('❌ Formato inválido. Usa `.spam <userID>`');
            }

            await message.channel.send(`🚀 Iniciando spam de ${spam.count} mensajes a <@${userId}> con ${tokens.length} bots...`);

            const reports = [];

            for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
                const batch = tokens.slice(i, i + BATCH_SIZE);
                const batchReports = await Promise.all(
                    batch.map((token, idx) =>
                        sendDM(token, userId, i + idx + 1)
                    )
                );
                reports.push(...batchReports);

                if (i + BATCH_SIZE < tokens.length) {
                    await wait(BATCH_DELAY);
                }
            }

            message.channel.send('📊 Reporte final:\n' + reports.join('\n'));
        });
    }

    return client;
}

async function sendDM(token, userId, botIndex) {
    let sent = 0, failed = 0;

    try {
        const dmChannel = await axios.post(
            'https://discord.com/api/v10/users/@me/channels',
            { recipient_id: userId },
            {
                headers: {
                    Authorization: `Bot ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const channelId = dmChannel.data.id;

        for (let i = 0; i < spam.count; i++) {
            let success = false;
            let attempts = 0;

            while (!success && attempts < 5) {
                try {
                    await axios.post(
                        `https://discord.com/api/v10/channels/${channelId}/messages`,
                        { content: spam.message },
                        {
                            headers: {
                                Authorization: `Bot ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    sent++;
                    success = true;
                } catch (err) {
                    attempts++;
                    if (attempts >= 5) {
                        failed++;
                        console.error(`⛔ Bot ${botIndex} → Mensaje ${i + 1} fallido tras ${attempts} intentos`);
                    } else {
                        await wait(750);
                    }
                }
            }
        }

        return `🤖 Bot ${botIndex}: ✅ ${sent} enviados, ❌ ${failed} fallidos`;
    } catch (err) {
        return `❌ Bot ${botIndex}: error creando canal DM - ${err.response?.data?.message || err.message}`;
    }
}

// Iniciar todos los bots
tokens.forEach((token, i) => {
    const client = createClient(token, i);
    clients.push(client);
    client.login(token).catch(err => {
        console.error(`❌ Error al conectar bot ${i + 1}:`, err.message);
    });
});
