document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const loc = document.getElementById('location').value.trim()
  const provider = document.getElementById('provider').value
  const status = document.getElementById('status')
  const out = document.getElementById('out')
  const guideEl = document.getElementById('guide')
  const weatherEl = document.getElementById('weather')

  status.textContent = ''
  out.style.display = 'none'

  if (!loc) {
    status.innerHTML = '<div class="error">Enter a location</div>'
    return
  }

  status.textContent = 'Generating...'

  try {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: loc, provider })
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    guideEl.textContent = data.guide
    weatherEl.textContent = JSON.stringify(data.weather, null, 2)
    out.style.display = 'block'
    status.textContent = ''
  } catch (err) {
    status.innerHTML = `<div class="error">${err.message}</div>`
  }
})
