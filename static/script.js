const api = document.querySelectorAll(".icon-api")
const arm = document.querySelector(".arm")
const vinyl = document.querySelector(".vinyl-wrapper")
const searchBar = document.querySelector(".search-bar")
const searchInput = document.querySelector(".search-input")
const myRecordsSection = document.querySelector(".myRecords-section")
const queueSection = document.querySelector(".queue-section")
const searchContainer = document.querySelector(".search-content")
const myRecordsContainer = document.querySelector(".myRecords-content")
const queueContainer = document.querySelector(".queue-content")
const homeTitle = document.querySelector(".section-title")
const activeDevice = document.querySelector(".active-device")
const defaultAudio = new Audio("/static/audio/Miles Away.mp3")

let queue = []
let debounceTimeout = null
let trackEndTimer = null
let watchedTrackId = null

// Adding event listener to link icon for api connection
if (api) {
  api.forEach(icon => {
    icon.addEventListener("click", () => {
      window.location.href = "/api/auth"
    })
  })
}

function refreshPlayer(icon) {
  if (!icon) return
  icon.classList.remove("spin-once")
  icon.offsetHeight
  icon.classList.add("spin-once")
  checkCurrentlyPlaying()
}

function showToast(message, category = "info") {
  const box = document.querySelector(".toast-box")
  if (!box) return

  const toast = document.createElement("header")
  toast.className = "toast toast-" + category
  
  if (category === "warning") {
    category = "issue"
  }

  toast.innerHTML = `
  <div class="alert" role="alert" onclick="removeToast(this)">
      <div class="alert-message">
          <p class="toast-category">${category.charAt(0).toUpperCase() + category.slice(1)}</p>
          <p>${message}</p>
      </div>
      <button type="button" class="toast-close" aria-label="Close">
          <span aria-hidden="true"><i class="fa-solid fa-xmark"></i></span>
      </button>
  </div>`
  box.appendChild(toast)
}

function removeToast(closeBtn) {
  const toast = closeBtn.closest(".toast")
  if (!toast) return

  toast.classList.add("closing")
  toast.addEventListener("animationend", () => {
    toast.remove()
  })
}

async function checkApiStatus() {
  try {
    const response = await fetch("/api/status", {
      headers: { "Content-Type": "application/json" }
    })

    if (!response.ok) return false
    
    const data = await response.json()
    return data.api_access
  } catch (error) {
    console.error("Error during checkApiStatus(): ", error)
  }
}

// Abstracting away troubleshooting
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)

  if (res.status !== 401) return res

  if (!await checkApiStatus()) {
    return res
  }

  // Try refresh once
  const refreshRes = await fetch("/api/refresh", { method: "POST" })
  if (!refreshRes.ok) {
    return res
  }
  
  return fetch(url, options)
}

// Getting user's previous queue if exists
async function getQueue() {
  const response = await apiFetch("/api/get-queue")
  if (!response.ok) {
    queue = []
    return
  }

  const queueIds = await response.json()
  if (!Array.isArray(queueIds) || queueIds.length === 0) {
    queue = []
    return
  }

  const tracksObj = await getTracks(queueIds)
  queue = Array.isArray(tracksObj?.tracks) ? tracksObj.tracks : []
}

// Displaying contents based on section
function showOnly(container) {
  [searchContainer, myRecordsContainer, queueContainer].forEach(section => {
    section.style.display = "none"
    section.innerHTML = ""
  })
  container.style.display = "grid"
}

// Setting home title
function setTitle(text) {
  if (homeTitle) {
    homeTitle.textContent = text
  }
}

// Listening for inputs
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      searchInput.value = ""
      searchInput.blur()
    }
  })

  // Search with debouncing
  searchInput.addEventListener("input", async (e) => {
    const value = e.target.value

    // Clear previous timeout if any
    clearTimeout(debounceTimeout)

    if (value && value !== "") {
      debounceTimeout = setTimeout(() => {
        searchTracks(value)
      }, 250)
    }
  })
}

// Adding event listener to arm for play/pause logic
if (arm) {
  arm.addEventListener("click", async () => {
    try {
      // Get currently playing song
      const data = await currentlyPlaying()
      if (!data) {
        if (defaultAudio.paused) {
          defaultAudio.play()

          const progress = defaultAudio.currentTime * 1000
          const tracklen = defaultAudio.duration * 1000
          engagePlayer(tracklen, progress)

          defaultAudio.addEventListener("ended", () => {
            disengagePlayer()
            defaultAudio.currentTime = 0;
          })
        } else {
          defaultAudio.pause()
          disengagePlayer()
        }
        return
      }
  
      if (data.is_playing) {
        await pause()
      } else {
        if (!defaultAudio.paused) {
          defaultAudio.pause()
        }
        loadTrack(data.item)
        await resume(data, data.progress_ms)
      }
    } catch (error) {
      console.error(error)
    }
  })
}

function engagePlayer(duration_ms, progress_ms = 0) {
  arm.style.animation = "none"
    arm.offsetHeight
    arm.style.transition = "transform 0.5s ease-in-out"
    arm.style.transform = `rotate(${0 - (8 * (progress_ms/duration_ms))}deg)`
    vinyl.style.animationPlayState = "running"
    setTimeout(() => {
      arm.style.transition = "none"
      arm.style.animation = "arm-propagation linear forwards"
      arm.style.animationDuration = `${duration_ms}ms`
      arm.style.animationDelay = `-${progress_ms}ms`
    }, 500)
}

function disengagePlayer() {
  arm.style.animation = "none"
  arm.offsetHeight

  const computed = window.getComputedStyle(arm)
  const currentTransform = computed.transform
  arm.style.transform = currentTransform

  arm.style.transition = "transform 0.5s ease-in-out"
  arm.offsetHeight
  arm.style.transform = `rotate(-22deg)`
  vinyl.style.animationPlayState = "paused"
}

// Displaying tracks received
function displayTracks(data, container) {
  // Clear loading text
  showOnly(container)

  const items = data?.items
  if (!Array.isArray(items)) {
    console.error("Unexpected tracks payload: ", data)
    return
  }

  // Looping to retrieve items from the response
  items.forEach(item => {
    // Creating a track element (contains cover_container, name, and artists)
    const track = document.createElement("div")
    track.classList.add("track")

    // Creating a cover_container element (contains cover, and buttons)
    const trackCoverContainer = document.createElement("div")
    trackCoverContainer.classList.add("track-cover-container")

    // Adding cover element
    const trackCover = document.createElement("img")
    trackCover.src = item.album.images[0].url
    trackCover.classList.add("track-cover")

    // Adding action buttons
    const trackButtons = document.createElement("div")
    trackButtons.innerHTML = `<div class="play-button track-button">
                                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                  <rect width="30" height="30" fill="url(#pattern0_180_10)"/>
                                  <defs>
                                    <pattern id="pattern0_180_10" patternContentUnits="objectBoundingBox" width="1" height="1">
                                      <use xlink:href="#image0_180_10" transform="scale(0.01)"/>
                                    </pattern>
                                    <image id="image0_180_10" width="100" height="100" preserveAspectRatio="none" xlink:href="data:image/png;base64,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"/>
                                  </defs>
                                </svg>
                              </div>

                              <div class="addToQueue-button track-button">
                                <svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                  <rect width="25" height="25" fill="url(#pattern0_178_5)"/>
                                  <defs>
                                    <pattern id="pattern0_178_5" patternContentUnits="objectBoundingBox" width="1" height="1">
                                      <use xlink:href="#image0_178_5" transform="scale(0.0111111)"/>
                                    </pattern>
                                    <image id="image0_178_5" width="90" height="90" preserveAspectRatio="none" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4qEECAAAACXBIWXMAAAsTAAALEwEAmpwYAAAE1klEQVR4nO2dTYgdRRDHy68Y9WQOYlaCaAhCRE2UxA80KnoNIijiJYKHHLyb50mjp6ASUQ8x5mQOIqLxY1HRswcPGjUaUYgfB4NoEj8SDGui+5NiC1mXN/NmunpmuufNDx489u1WV/2ZN9NVXd0rMjAwMDAwMDAwMDAwMJAWwPnAOuA+4FHgZeAT4ARwGNgBLOvaz2wAVgF3Ag8BzwHvAz8A80xmR9f+JwWwDLgc2AyMgN3Ah8BxfPwk0whwIXAzsNW+2rPAt8A/NIT0/Oq8Erg38tU5nULTwdUZguQIcA7wJHCUTJAcAZ4mMyRHgJ/JDMkRMkRyhAyRHCFDJEfIEMkRMkRyhAyRHCFDJEdIl7+LPpAcoXtOWz1l1uorW63eckHRH0iO0B6ngIPAqyboFuA64Ly6vkmOEJ+5RYJut9KqlljPiuWb5Ajh/AZ8DOy1GvVmW1E5s2nfJEeYzK9W5N+9RNAzuvJNcoRi9IG0IkXfJEdIOJiUfetVMCTsW6+CIWHfehUMCfvWq2BI2LdeBUPCvvUqGBL2rVfBkLBvvQqGhH3rVTAk7FuvggHWABcB59pL36+RHCFhoXsFg9DtwCB0OzAI3Q4MQk+f0CzMLG4HngDeAL6yFR5d2P3L3h+0zx4HbtO/kRwgAaFtNfxF4HfC1i51me1aSRk6FFrFsT2GsXhPN4RKitCB0NrLATxb1o3kbMh5Blgu0yw0cAVwgOb5LKkskhaFBjYAv9Aex4CbZJqEBq63zfNto2NujB1PiABjaeB20eU+xiOd30YoIKL95cCndM+BsobKxqGAiPZ1dhGKJikPAyvttc1+FsrOWHGFbKYfS8R5smcKt22MTe3/80z9rokRW10hLi3yKJJ9bzKycozNi50234kRW10hHijyJlJa7aLEtgc95Wa9N746QqwGfqwbZA37WrtwUWLbywve+MoOhVoBXA3cA+wB/gwJskYVLqRAVMkHr12rAoYfgmVbGPQp/S7wtc0f52MGWQUrdbopsR+DWysFs2TgtcDboaKOo7YT//dH68mpC729blB3NZHaik/oN5v0IYZtYF+dgG5wTuCbElpXRionI56xloxbJ6n5sqrRs4FDNIT4Aj4akozEomJSc6SqsftpEPEFWuWKmvGMMWH8mQrjz1U19goNInkLfUlMob+nOU62cOsYecaYMP4jMW8dpQmHk0MtPQxHMa9su2WMYj8MT9IcrzkD7s/0DviO5tjiFFqbW1IX+rGqwegh1k1wWM/KcAqtHUSpC72pTkbYBA96RF5UVNIOolSFPla5qKTnXwBfEJeXYp1aYG1aqQq9q24w6+wgkhi8FfP8fFvGclFi28N8UNsYcAfwh2PgUzYlin7+hvXCeZgJzPrKmPVuqnm95oBz+hUCLvMKOuEbpwuioYwCk5Ei1JerYgS21ipiHwDfLFrlOG4ncX0EPA/craefuwes5pM2HIbyX1JTMxkp4inpKyw00Oynez7vtIGmDezWpstqXaGNlatlGgA2dtjkuEGmCbpp271RphEWbiPaJN40+6fmdjHhAbnTOfUr4rT9J460tlZ0iTYcai9cpDaJeTtI1j9P7ivAem3Tsg6ikPvwrmR3Y0mCWBvxJjs8dp+ugtiymCYp+tL3WkjTLFh/5xZPfeZfm06/4ryCpM8AAAAASUVORK5CYII="/>
                                  </defs>
                                </svg>
                              </div>`
    trackButtons.classList.add("track-buttons", "glassy")

    const playButton = trackButtons.querySelector(".play-button")
    const queueButton = trackButtons.querySelector(".addToQueue-button")

    playButton.dataset.uri = item.uri
    queueButton.dataset.uri = item.uri

    // Adding track name
    const trackName = document.createElement("p")
    trackName.textContent = item.name
    trackName.classList.add("track-name", "small", "name-overflow")

    // Adding artist name
    const trackArtist = document.createElement("span")
    let artists = []
    item.artists.forEach(artist => {
      artists.push(artist.name)
    })
    trackArtist.textContent = artists.join(", ")
    trackArtist.classList.add("track-artist", "xsmall", "name-overflow")

    // Listening to clicks on action buttons
    playButton.addEventListener("click", async () => {
      try {
        // Play Track
        await play(item, 0)
      } catch (error) {
        console.error(error)
      }
    })

    queueButton.addEventListener("click", () => {
      // Add to Queue
      addToQueue(item)
    })

    // Appending children to their respective divs
    trackCoverContainer.appendChild(trackButtons)
    trackCoverContainer.appendChild(trackCover)
    track.appendChild(trackCoverContainer)
    track.appendChild(trackName)
    track.appendChild(trackArtist)
    container.appendChild(track)
  })
}

// Moving queue items
function swapQueueItems(index1, index2) {
  if (index1 >= 0 && index1 < queue.length && index2 >= 0 && index2 < queue.length) {
    [queue[index1], queue[index2]] = [queue[index2], queue[index1]]
  }
  return queue
}
function moveItemUp(index) {
  if (index > 0) {
    return swapQueueItems(index, index - 1)
  }
  return queue
}
function moveItemDown(index) {
  if (index < queue.length - 1) {
    return swapQueueItems(index, index + 1)
  }
  return queue
}

// Checking if a song is currently playing (Load/Play)
async function checkCurrentlyPlaying() {
  if (await checkApiStatus()) {
    try {
      const track = await currentlyPlaying()
    
      if (!track) {
        clearTrackEndWatcher()
        return { is_playing: false }
      }
  
      loadTrack(track.item)
    
      if (track.is_playing) {
        // Set record as currently playing
        engagePlayer(track.item.duration_ms, track.progress_ms)
        scheduleTrackEndWatcher(track.item, track.progress_ms || 0)
        return { is_playing: true }
      } else {
      disengagePlayer()
      clearTrackEndWatcher()
      return { is_playing: false }
      }
    } catch (error) {
      console.error("checkCurrentlyPlaying failed: ", error)
    }
  }
}

// Getting currently playing song
async function currentlyPlaying() {
  const response = await apiFetch("/api/currently-playing")

  if (response.status == 204) {
    return null
  }

  if (!response.ok) {
    console.error("API error: ", response.status)
    return null
  }

  const data = await response.json()

  if (!data) return null

  return {
    item: data.item,
    progress_ms: data.progress_ms,
    is_playing: data.is_playing
  }
}

function clearTrackEndWatcher() {
  if (trackEndTimer) {
    clearTimeout(trackEndTimer)
    trackEndTimer = null
  }
  watchedTrackId = null
}

// Load track on the player in inactive state
function loadTrack(track) {
  let artists = []
  track.artists.forEach(artist => {
    artists.push(artist.name)
  })
  document.querySelector(".record-name").textContent = track.name
  document.querySelector(".record-artist").textContent = artists.join(", ")
  document.querySelector(".vinyl-sticker img").src = track.album.images[0].url
  document.querySelector(".track-background-image").style.backgroundImage = `url("/static/images/cream.webp"), url("${track.album.images[0].url}")`
  disengagePlayer()
}

async function onTrackEnded() {
  try {
    const playback = await checkCurrentlyPlaying()
    
    if (playback.is_playing) return

    disengagePlayer()
    if (queue.length === 0) return

    const next = queue.shift()

    await play(next, 0)
    setQueue()
  } catch (error) {
    console.error(error)
  }
}

function scheduleTrackEndWatcher(track, progress_ms = 0) {
  clearTrackEndWatcher()

  if (!track || !track.id || typeof track.duration_ms !== "number") return

  watchedTrackId = track.id

  const remaining = Math.max(0, track.duration_ms - progress_ms)
  const buffer = 500

  trackEndTimer = setTimeout(async () => {
    try {
      const data = await currentlyPlaying()

      if (!data || !data.item || !data.is_playing) {
        onTrackEnded()
        return
      }

      const currentId = data.item.id

      if (currentId !== watchedTrackId) {
        onTrackEnded()
        return
      }

      engagePlayer(data.item.duration_ms, data.progress_ms)
      scheduleTrackEndWatcher(data.item, data.progress_ms || 0)
    } catch (error) {
      console.error("Track end watcher failed: ", error)
      trackEndTimer = setTimeout(() => {
        scheduleTrackEndWatcher(track, progress_ms)
      }, 1500)
    }
  }, remaining + buffer)
}

// Play the track
async function play(data, position_ms) {
  try {
    const response = await apiFetch("/api/play-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: data.uri, position_ms: position_ms })
    })

    if (!response.ok) {
      if (response.status == 403) {
        showToast("This feature requires Spotify Premium.", "warning")
        return
      }
      const payload = await response.json()
      showToast(payload.message, payload.category)
      return
    }

    // Only update UI on success
    if (!defaultAudio.paused) {
      defaultAudio.pause()
    }
    loadTrack(data)
    engagePlayer(data.duration_ms)

    // Start watcher for end-of-track
    scheduleTrackEndWatcher(data, position_ms)
  } catch(error) {
    console.error("Error during play(): ", error)
  }
}

// Pause the track
async function pause() {
  try {
    const response = await apiFetch("/api/pause-track", { method: "POST" })
    
    if (!response.ok) {
      console.error("Pause failed:", response.status)
      return
    }

    clearTrackEndWatcher()
    disengagePlayer()
  } catch (error) {
    console.error("Error during pause(): ", error)
  }
}

// Resume the track
async function resume(data, progress_ms) {
  try {
    const track = data.item

    const response = await apiFetch("/api/play-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: track.uri, position_ms: progress_ms })
    })
    
    if (!response.ok) {
      console.error("Failed to resume playback: ", response.status)
      return
    }

    // Start watcher for end-of-track
    scheduleTrackEndWatcher(track, progress_ms)
    engagePlayer(track.duration_ms, progress_ms)
  } catch (error) {
    console.error("Error during resume(): ", error)
  }
}

// Adding item to queue
function addToQueue(item) {
  if (!item || !item.id) {
    return
  }

  if (queue.length >= 50) {
    console.log("Queue is full")
    return
  }
  queue.push(item)
  setQueue()
}

// Search item api call
async function searchTracks(value) {
  try {
      const response = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value })
      })
      if (!response.ok) {
        console.error("Search API error: ", response.status)
        return
      }

      const data = await response.json()
      setTitle("Search Results")
      displayTracks(data.tracks, searchContainer)
    } catch (error) {
      console.error(error)
    }
}

// Get user's top tracks
async function myTracks() {
  try {
    // Top Tracks
    const response = await apiFetch("/api/top-tracks")

    if (!response.ok) {
      showToast("Spotify not connected.", "error")
      return
    }

    const data = await response.json()
    displayTracks(data, myRecordsContainer)
    setTitle("My Records")
  } catch (error) {
    console.error(error)
  }
}

// Set user's Queue
async function setQueue() {
  const response = await apiFetch("/api/set-queue", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queue: queue.map(item => item.id) })
  })

  if (response.ok) {
    console.log("Queue updated successfully.")
  }
}

// Displaying queue items
function displayQueue() {
  showOnly(queueContainer)
  setTitle("Queue")

  if (queue.length === 0) {
    const empty = document.createElement("p")
    empty.textContent = "Queue is empty."
    empty.classList.add("queue-empty")
    queueContainer.appendChild(empty)
    return
  }

  // Looping to retrieve items from the response
  queue.forEach((item, index) => {
    if (!item) {
      return
    }

    const queueItem = document.createElement("li")
    queueItem.classList.add("queue-item")

    const queueRow = document.createElement("div")
    queueRow.classList.add("queue-row")

    const trackInfo = document.createElement("div")

    // Adding track name
    const trackName = document.createElement("p")
    trackName.textContent = item.name
    trackName.classList.add("queue-track", "small", "name-overflow")

    // Adding artist name
    const trackArtist = document.createElement("span")
    let artists = []
    item.artists.forEach(artist => {
      artists.push(artist.name)
    })
    trackArtist.textContent = artists.join(", ")
    trackArtist.classList.add("queue-artist", "xsmall", "name-overflow")

    const queueButtons = document.createElement("div")
    queueButtons.innerHTML = `<div class="up-button queue-button">
                                <i class="fa-solid fa-chevron-up"></i>
                              </div>

                              <div class="down-button queue-button">
                                <i class="fa-solid fa-chevron-down"></i>
                              </div>

                              <div class="remove-button queue-button">
                                <i class="fa-solid fa-minus"></i>
                              </div>`
    queueButtons.classList.add("queue-buttons")

    const upButton = queueButtons.querySelector(".up-button")
    const downButton = queueButtons.querySelector(".down-button")
    const removeButton = queueButtons.querySelector(".remove-button")

    upButton.addEventListener("click", () => {
      moveItemUp(index)
      displayQueue()
      setQueue()
    })
    downButton.addEventListener("click", () => {
      moveItemDown(index)
      displayQueue()
      setQueue()
    })
    removeButton.addEventListener("click", () => {
      queue.splice(index, 1)
      displayQueue()
      setQueue()
    })
    
    // Appending children to their respective divs
    queueContainer.appendChild(queueItem)
    queueItem.appendChild(queueRow)

    queueRow.appendChild(trackInfo)
    queueRow.appendChild(queueButtons)

    trackInfo.appendChild(trackName)
    trackInfo.appendChild(trackArtist)
  })
}

// Retrieve tracks data using ids
async function getTracks(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { tracks: [] }
  }

  const response = await apiFetch("/api/get-tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  })

  if (!response.ok) {
    console.error("Get tracks API error: ", response.status)
    return
  }

  const data = await response.json()
  return data || { tracks: [] }
}

// Get active devices
async function availableDevices() {
  const response = await apiFetch("/api/available-devices")

  if (!response.ok) {
    console.log("No active devices found: ", response.status)
    return
  }

  const device = await response.json()
  activeDevice.textContent = `Playing on: ${device}`
}

// Check for premium account
async function accountTier() {
  const response = await apiFetch("/api/account-tier")

  if (!response.ok) {
    if (response.status == 403) {
      showToast("Please contact admin to grant you access.", "warning")
      return
    }
    return
  }
  const product = await response.json()
  const premium = product.is_premium
  
  if (premium) return true

  showToast("You can 'Search' but not 'Play' songs without Spotify Premium.", "warning")
  return false
}

// If API is connected, then only myTracks() and checkCurrentlyPlaying()
async function main() {
  if (await checkApiStatus() && await accountTier()) {
    await myTracks()
    await checkCurrentlyPlaying()
    await getQueue()
    await availableDevices()
  }
}

main()