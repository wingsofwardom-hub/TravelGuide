// server.js - Express server for TravelGuide

require('dotenv').config()
const express = require('express')
const fetch = require('node-fetch')
const path = require('path')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const PORT = process.env.PORT || 3000

app.post('/generate', async (req, res) => {
  const { location, provider } = req.body || {}
  if (!location) return res.status(400).json({ error: 'location is required' })
  try {
    const weather = await fetchWeather(location, provider || process.env.WEATHER_PROVIDER || 'openweathermap')
    const prompt = buildPrompt(location, weather)
    const guide = await callLLM(prompt)
    res.json({ guide, weather })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`TravelGuide server listening on http://localhost:${PORT}`)
})

// --- helper functions ---

async function fetchWeather(location, provider) {
  const p = (provider || 'openweathermap').toLowerCase()

  if (p === 'weatherapi') {
    const key = process.env.WEATHER_API_KEY
    if (!key) throw new Error('WEATHER_API_KEY is not set')
    const url = `http://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(location)}`
    const r = await fetch(url)
    if (!r.ok) throw new Error('WeatherAPI error: ' + await r.text())
    return await r.json()
  }

  if (p === 'openweathermap' || !p) {
    const key = process.env.WEATHER_API_KEY
    if (!key) throw new Error('WEATHER_API_KEY is not set')
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${encodeURIComponent(key)}&units=metric`
    const r = await fetch(url)
    if (!r.ok) throw new Error('OpenWeatherMap error: ' + await r.text())
    return await r.json()
  }

  throw new Error('Unsupported weather provider: ' + provider)
}

function buildPrompt(location, weather) {
  const weatherSummary = summarizeWeather(weather)
  return `You are an expert local travel guide writer. Given the user's location and current weather information, produce a concise travel guide that includes:
- Top 5 spots to visit (with short reason why)
- Things to watch out for / safety tips and weather-specific cautions
- What to pack and clothing suggestions based on weather
- One 1-day sample itinerary (morning, afternoon, evening)
- A short 2-sentence local tip or etiquette note

Location: ${location}

Weather summary:
${weatherSummary}

Write the guide in friendly, actionable bullet points and short paragraphs, suitable for printing or saving. Do not include any extraneous commentary about API calls.`
}

function summarizeWeather(weather) {
  try {
    if (weather?.current) {
      // weatherapi.com shape
      const c = weather.current
      return `Temperature: ${c.temp_c}°C, Condition: ${c.condition?.text || ''}, Wind: ${c.wind_kph} kph, Humidity: ${c.humidity}%`
    }
    if (weather?.main) {
      // openweathermap shape
      const temp = weather.main.temp
      const cond = weather.weather?.[0]?.description || ''
      const wind = weather.wind?.speed
      const hum = weather.main.humidity
      return `Temperature: ${temp}°C, Condition: ${cond}, Wind: ${wind} m/s, Humidity: ${hum}%`
    }
    return JSON.stringify(weather)
  } catch (e) {
    return JSON.stringify(weather)
  }
}

async function callLLM(prompt) {
  // Anthropic's current Messages API. Do NOT use the old /v1/complete
  // completions endpoint or "Authorization: Bearer" - that API is deprecated.
  const llmUrl = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages'
  const llmKey = process.env.LLM_API_KEY || process.env.CLAUDE_API_KEY
  if (!llmKey) throw new Error('LLM/CLAUDE API key is not set in LLM_API_KEY or CLAUDE_API_KEY')

  // Set LLM_MODEL in your .env to whatever current model string you want to use.
  // Check https://docs.claude.com/en/docs/about-claude/models for the current list -
  // model names change over time, so don't hardcode one you haven't verified.
  const model = process.env.LLM_MODEL
  if (!model) throw new Error('LLM_MODEL is not set - see .env.example')

  const body = {
    model,
    max_tokens: 800,
    temperature: 0.6,
    messages: [
      { role: 'user', content: prompt }
    ]
  }

  const r = await fetch(llmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llmKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  })

  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`LLM request failed: ${r.status} ${txt}`)
  }

  const json = await r.json()

  // Native Anthropic Messages API response shape: content is an array of blocks.
  if (json.content && Array.isArray(json.content)) {
    return json.content.map(block => block.text || '').join('\n')
  }
  // Fallback for OpenAI-compatible proxies, in case LLM_API_URL points elsewhere.
  if (json.choices && json.choices[0]) return json.choices[0].text || json.choices[0].message?.content
  return JSON.stringify(json)
}
