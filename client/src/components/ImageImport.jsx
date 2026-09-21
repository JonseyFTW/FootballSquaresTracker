import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../api'

// Phone photos run 3000px+ wide. The model reads a board fine at a fraction
// of that, and the full-size upload is most of why imports used to crawl (and
// time out) on mobile data.
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.9

async function toUploadableImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

// Fall back to the raw file if this browser can't do the resize
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}

function ImageImport({ onImportComplete }) {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [available, setAvailable] = useState(true)
  const fileInputRef = useRef(null)

  // Import runs on the app's own AI key — all the client needs to know is
  // whether the server has one.
  useEffect(() => {
    // Clear keys the old bring-your-own-key form left in this browser
    for (const provider of ['gemini', 'openai', 'claude', 'openrouter']) {
      localStorage.removeItem(`apiKey_${provider}`)
    }
    localStorage.removeItem('llmProvider')
    localStorage.removeItem('openrouterModel')

    const checkAvailability = async () => {
      const { ok, data } = await apiFetch('/api/llm-providers')
      setAvailable(ok ? Boolean(data.available) : false)
    }
    checkAvailability()
  }, [])

  const acceptFile = async (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    setError(null)
    setImage(file)

    try {
      setImagePreview(await toUploadableImage(file))
    } catch {
      setImagePreview(await readFileAsDataUrl(file))
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) acceptFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleImport = async () => {
    if (!image) {
      setError('Please select an image')
      return
    }

    setLoading(true)
    setError(null)

    const { ok, status, data } = await apiFetch('/api/parse-image', {
      method: 'POST',
      body: JSON.stringify({ image: imagePreview })
    })

    setLoading(false)

    if (!ok) {
      // A gateway timeout has no JSON body of its own to explain itself
      setError(data.error || (status === 504
        ? 'That took too long to read. Try again, or crop the photo to just the board.'
        : 'Failed to parse image'))
      return
    }

    onImportComplete(data)
  }

  const clearImage = () => {
    setImage(null)
    setImagePreview(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="image-import">
      <h4>Import from Image</h4>
      <p className="import-description">
        Upload a screenshot of your football squares grid and we'll extract all the data automatically.
      </p>

      {!available && (
        <div className="import-error">
          Image import is unavailable right now — enter your board details manually below.
        </div>
      )}

      {/* Drop Zone + Browse Button */}
      {imagePreview ? (
        <div className="drop-zone has-image">
          <div className="image-preview-container">
            <img src={imagePreview} alt="Preview" className="image-preview" />
            <button
              type="button"
              className="btn btn-secondary clear-image"
              onClick={clearImage}
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="drop-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="drop-zone-content">
              <div className="drop-icon">📷</div>
              <p>Drag & drop an image here</p>
              <small>Supports PNG, JPG, WEBP</small>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-browse"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse Files
          </button>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Error Display */}
      {error && (
        <div className="import-error">
          {error}
        </div>
      )}

      {/* Import Button */}
      <button
        type="button"
        className="btn btn-primary import-btn"
        onClick={handleImport}
        disabled={!image || !available || loading}
      >
        {loading ? (
          <>
            <span className="spinner-small"></span>
            Analyzing Image...
          </>
        ) : (
          'Import Data from Image'
        )}
      </button>
    </div>
  )
}

export default ImageImport
