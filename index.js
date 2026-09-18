const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

// ===== НАСТРОЙКИ =====
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const FEATURE_KEYWORDS = ['FEATURE:', '#feature', 'фича:', 'feature request']; // можно менять
const PORT = process.env.PORT || 3000;

// Проверка, что это feature request
function isFeatureRequest(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return FEATURE_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

// Очистка HTML из заметки Intercom
function cleanText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

app.get('/', (req, res) => {
  res.send('Intercom → Discord Feature Request Bridge is running');
});

// Главный endpoint для Intercom webhook
app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    // Intercom иногда шлёт ping
    if (payload.type === 'notification_event' && payload.topic === 'ping') {
      return res.status(200).send('pong');
    }

    // Нас интересует только добавление заметки админом
    if (payload.topic !== 'conversation.admin.noted') {
      return res.status(200).send('ignored');
    }

    const conversation = payload.data?.item;
    if (!conversation) {
      return res.status(200).send('no conversation');
    }

    // Берём последнюю часть (это заметка)
    const parts = conversation.conversation_parts?.conversation_parts || [];
    const lastPart = parts[parts.length - 1];

    if (!lastPart || lastPart.part_type !== 'note') {
      return res.status(200).send('not a note');
    }

    const noteBody = lastPart.body || '';
    const cleanNote = cleanText(noteBody);

    // Проверяем, есть ли ключевое слово
    if (!isFeatureRequest(cleanNote)) {
      return res.status(200).send('not a feature request');
    }

    // Собираем полезную информацию
const adminName = lastPart.author?.name || 'Unknown agent';
const conversationId = conversation.id;
const conversationUrl = `https://app.intercom.com/a/apps/${payload.app_id}/inbox/conversation/${conversationId}`;

// Контакт (оставляем на всякий случай, но не используем)
const contact = conversation.contacts?.contacts?.[0];
const contactName = contact?.name || contact?.email || 'Unknown customer';
const contactEmail = contact?.email || '—';

// Формируем сообщение в Discord (чистый вариант)
const discordMessage = {
  embeds: [{
    title: '🚀 New Feature Request',
    color: 0x5865F2,
    description: `**Агент:** ${adminName}\n\n${cleanNote}\n\n${conversationUrl}`,
    timestamp: new Date().toISOString()
  }]
};

    // Отправляем в Discord
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordMessage)
    });

    if (!response.ok) {
      console.error('Discord error:', await response.text());
      return res.status(500).send('Discord error');
    }

    console.log(`Feature request sent to Discord from conversation ${conversationId}`);
    res.status(200).send('ok');

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('error');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
