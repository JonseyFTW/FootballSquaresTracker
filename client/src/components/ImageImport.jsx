import { useState, useRef, useEffect } from 'react'

function ImageImport({ onImportComplete }) {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [provider, setProvider] = useState('gemini')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState([])
  const [useServerKeys, setUseServerKeys] = useState(false)
  const [orModel, setOrModel] = useState(localStorage.getItem('openrouterModel') || '')
  const [orDefaultModel, setOrDefaultModel] = useState('google/gemini-2.5-flash-lite')
  const fileInputRef = useRef(null)

  // Check for server-configured providers on mount
  useEffect(() => {
    const checkProviders = async () => {
      try {
        const response = await fetch('/api/llm-providers')
        const data = await response.json()
        if (data.openrouterDefaultModel) {
          setOrDefaultModel(data.openrouterDefaultModel)
        }
        if (data.hasConfiguredProviders) {
          setConfiguredProviders(data.providers)
          setUseServerKeys(true)
          // Set first configured provider as default
          if (data.providers.length > 0) {
            setProvider(data.providers[0].id)
          }
        } else {
          // Fall back to localStorage for manual keys
          const savedProvider = localStorage.getItem('llmProvider') || 'gemini'
          setProvider(savedProvider)
          setApiKey(localStorage.getItem(`apiKey_${savedProvider}`) || '')
        }
      } catch (err) {
        // If server check fails, fall back to manual mode
        const savedProvider = localStorage.getItem('llmProvider') || 'gemini'
        setProvider(savedProvider)
        setApiKey(localStorage.getItem(`apiKey_${savedProvider}`) || '')
      }
    }
    checkProviders()
  }, [])

  // Update API key when provider changes (only for manual mode)
  useEffect(() => {
    if (!useServerKeys) {
      const savedKey = localStorage.getItem(`apiKey_${provider}`) || ''
      setApiKey(savedKey)
      localStorage.setItem('llmProvider', provider)
    }
  }, [provider, useServerKeys])

  // Save API key when it changes
  const handleApiKeyChange = (value) => {
    setApiKey(value)
    localStorage.setItem(`apiKey_${provider}`, value)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    setError(null)
    setImage(file)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setError(null)
      setImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleImport = async () => {
    if (!image) {
      setError('Please select an image')
      return
    }

    if (!useServerKeys && !apiKey) {
      setError('Please enter your API key')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const body = {
        image: imagePreview,
        provider
      }
      // Only include apiKey if not using server keys
      if (!useServerKeys) {
        body.apiKey = apiKey
      }
      // OpenRouter can route to any vision model the user names
      if (provider === 'openrouter' && orModel.trim()) {
        body.model = orModel.trim()
      }

      const response = await fetch('/api/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse image')
      }

      onImportComplete(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const clearImage = () => {
    setImage(null)
    setImagePreview(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getProviderLabel = (p) => {
    switch (p) {
      case 'gemini': return 'Google Gemini'
      case 'claude': return 'Anthropic Claude'
      case 'openai': return 'OpenAI'
      case 'openrouter': return 'OpenRouter'
      default: return p
    }
  }

  const getApiKeyPlaceholder = () => {
    switch (provider) {
      case 'gemini': return 'Enter your Google AI API key'
      case 'claude': return 'Enter your Anthropic API key'
      case 'openai': return 'Enter your OpenAI API key'
      case 'openrouter': return 'Enter your OpenRouter API key'
      default: return 'Enter API key'
    }
  }

  const handleOrModelChange = (value) => {
    setOrModel(value)
    localStorage.setItem('openrouterModel', value)
  }

  const openrouterModelField = provider === 'openrouter' && (
    <div className="form-group">
      <label>Model (any OpenRouter vision model)</label>
      <input
        type="text"
        value={orModel}
        onChange={(e) => handleOrModelChange(e.target.value)}
        placeholder={orDefaultModel}
      />
      <small className="api-key-hint">
        Leave blank for the default ({orDefaultModel}). Browse models at openrouter.ai/models —
        e.g. anthropic/claude-sonnet-5, openai/gpt-4o-mini.
      </small>
    </div>
  )

  return (
    <div className="image-import">
      <h4>Import from Image</h4>
      <p className="import-description">
        Upload a screenshot of your football squares grid and we'll extract all the data automatically.
      </p>

      {/* Provider Selection */}
      <div className="import-settings">
        {useServerKeys ? (
          /* Server-configured providers */
          <div className="form-group">
            <label>AI Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {configuredProviders.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <small className="api-key-hint configured">
              API key configured in .env file
            </small>
            {openrouterModelField}
          </div>
        ) : (
          /* Manual API key entry */
          <>
            <div className="form-group">
              <label>AI Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="gemini">Google Gemini (Cheapest)</option>
                <option value="openai">OpenAI GPT-4o-mini</option>
                <option value="claude">Anthropic Claude</option>
                <option value="openrouter">OpenRouter (any model)</option>
              </select>
            </div>

            {openrouterModelField}

            <div className="form-group">
              <label>API Key for {getProviderLabel(provider)}</label>
              <div className="api-key-input">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={getApiKeyPlaceholder()}
                />
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <small className="api-key-hint">
                Tip: Add API keys to .env file to skip this step
              </small>
            </div>
          </>
        )}
      </div>

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
        disabled={!image || (!useServerKeys && !apiKey) || loading}
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
