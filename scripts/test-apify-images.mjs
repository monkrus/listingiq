const token = process.env.APIFY_API_TOKEN
const actorId = 'tri_angle~airbnb-rooms-urls-scraper'

async function test() {
  console.log('Starting Apify run...')
  const r = await fetch('https://api.apify.com/v2/acts/' + actorId + '/runs?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url: 'https://www.airbnb.com/rooms/606864217329481273' }],
      maxListings: 1,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] }
    })
  })
  const run = await r.json()
  if (!run.data?.id) { console.log('Failed to start run:', JSON.stringify(run)); return }
  const runId = run.data.id
  console.log('Run started:', runId)

  while (true) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await fetch('https://api.apify.com/v2/actor-runs/' + runId + '?token=' + token)
    const st = await s.json()
    console.log('Status:', st.data.status)
    if (st.data.status === 'SUCCEEDED') break
    if (st.data.status === 'FAILED' || st.data.status === 'ABORTED') {
      console.log('Run failed')
      return
    }
  }

  const itemsRes = await fetch('https://api.apify.com/v2/actor-runs/' + runId + '/dataset/items?token=' + token)
  const items = await itemsRes.json()
  console.log('Item count:', items.length)

  if (!items.length) { console.log('No items returned'); return }

  const item = items[0]
  console.log('Top-level keys:', Object.keys(item).join(', '))

  const imgs = item.images ?? item.photos ?? item.pictureUrls ?? item.photoUrls ?? []
  console.log('Images count:', imgs.length)

  if (imgs.length) {
    console.log('First image type:', typeof imgs[0])
    console.log('First image:', JSON.stringify(imgs[0]).substring(0, 500))
    if (typeof imgs[0] === 'object' && imgs[0]) {
      console.log('Image keys:', Object.keys(imgs[0]).join(', '))
    }
  } else {
    console.log('No images in known fields. Checking all array fields...')
    for (const [key, val] of Object.entries(item)) {
      if (Array.isArray(val) && val.length) {
        console.log(key + ':', val.length, 'items, first:', JSON.stringify(val[0]).substring(0, 300))
      }
    }
  }
}

test().catch(console.error)
