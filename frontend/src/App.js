import React, { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

const FoodCamera = ({ onFoodAnalyzed }) => {
  const [imgSrc, setImgSrc] = useState(null);
  const [nutritionData, setNutritionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isUsingCamera, setIsUsingCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      setIsUsingCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Camera access denied. Please use file upload instead.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsUsingCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      const imageSrc = canvas.toDataURL('image/jpeg');
      setImgSrc(imageSrc);
      stopCamera();
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImgSrc(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const retake = () => {
    setImgSrc(null);
    setNutritionData(null);
    setError(null);
  };

  const analyzeFood = async () => {
    if (!imgSrc) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(imgSrc);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('file', blob, 'food-image.jpg');

      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const result = await fetch(`${backendUrl}/api/analyze-food`, {
        method: 'POST',
        body: formData
      });

      const data = await result.json();

      if (data.success) {
        setNutritionData(data.data);
      } else {
        setError('Failed to analyze food image');
      }
    } catch (err) {
      setError('Error analyzing image: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveFood = async () => {
    if (!nutritionData) return;

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/save-food-entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...nutritionData,
          user_id: 'default_user'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        onFoodAnalyzed && onFoodAnalyzed();
        setImgSrc(null);
        setNutritionData(null);
        alert('Food saved successfully!');
      } else {
        setError('Failed to save food entry');
      }
    } catch (err) {
      setError('Error saving food: ' + err.message);
    }
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="food-camera">
      <div className="camera-container">
        {imgSrc ? (
          <div className="captured-image">
            <img src={imgSrc} alt="Captured food" />
            <div className="button-group">
              <button onClick={retake} className="btn btn-secondary">
                Retake Photo
              </button>
              <button onClick={analyzeFood} disabled={loading} className="btn btn-primary">
                {loading ? 'Analyzing...' : 'Analyze Food'}
              </button>
            </div>
          </div>
        ) : isUsingCamera ? (
          <div className="camera-view">
            <video ref={videoRef} autoPlay playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="camera-controls">
              <button onClick={capturePhoto} className="btn btn-primary capture-btn">
                📸 Capture
              </button>
              <button onClick={stopCamera} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="camera-options">
            <div className="upload-placeholder">
              <div className="upload-icon">📱</div>
              <h3>Scan Your Food</h3>
              <p>Take a photo or upload an image to get nutritional information</p>
              <div className="button-group">
                <button onClick={startCamera} className="btn btn-primary">
                  📸 Use Camera
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
                  📁 Upload Photo
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {nutritionData && (
        <div className="nutrition-results">
          <h3>Food Analysis Results</h3>
          <div className="food-info">
            <div className="food-category">
              <strong>Category:</strong> {nutritionData.category}
            </div>
            <div className="confidence">
              <strong>Confidence:</strong> {(nutritionData.probability * 100).toFixed(1)}%
            </div>
          </div>
          
          {nutritionData.nutrition && (
            <div className="nutrition-breakdown">
              <h4>Nutrition Information</h4>
              <div className="nutrition-grid">
                {Object.entries(nutritionData.nutrition).map(([key, value]) => (
                  <div key={key} className="nutrition-item">
                    <span className="nutrient-name">{key.charAt(0).toUpperCase() + key.slice(1)}:</span>
                    <span className="nutrient-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={saveFood} className="btn btn-primary save-btn">
            Save to Diary
          </button>
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const [dailySummary, setDailySummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDailySummary = async () => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/daily-summary?user_id=default_user`);
      const data = await response.json();
      
      if (data.success) {
        setDailySummary(data.data);
      }
    } catch (err) {
      console.error('Error fetching daily summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailySummary();
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (!dailySummary) {
    return <div className="error">Failed to load dashboard</div>;
  }

  const macroData = [
    { name: 'Carbs', value: dailySummary.total_carbs, goal: dailySummary.goal_carbs, color: '#FF6B6B' },
    { name: 'Protein', value: dailySummary.total_protein, goal: dailySummary.goal_protein, color: '#4ECDC4' },
    { name: 'Fat', value: dailySummary.total_fat, goal: dailySummary.goal_fat, color: '#45B7D1' }
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Today's Overview</h2>
        <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="calorie-summary">
        <div className="calorie-circle">
          <div className="calorie-progress">
            <div className="calorie-number">{dailySummary.total_calories}</div>
            <div className="calorie-label">of {dailySummary.goal_calories} cal</div>
          </div>
        </div>
        <div className="calorie-remaining">
          <span>{dailySummary.goal_calories - dailySummary.total_calories} cal remaining</span>
        </div>
      </div>

      <div className="macros-section">
        <h3>Macronutrients</h3>
        <div className="macros-grid">
          {macroData.map((macro) => (
            <div key={macro.name} className="macro-item">
              <div className="macro-header">
                <span className="macro-name">{macro.name}</span>
                <span className="macro-value">{macro.value}g</span>
              </div>
              <div className="macro-progress">
                <div 
                  className="macro-progress-bar" 
                  style={{ 
                    width: `${Math.min((macro.value / macro.goal) * 100, 100)}%`,
                    backgroundColor: macro.color
                  }}
                />
              </div>
              <div className="macro-goal">Goal: {macro.goal}g</div>
            </div>
          ))}
        </div>
      </div>

      <div className="daily-stats">
        <div className="stat-item">
          <div className="stat-number">{dailySummary.entries_count}</div>
          <div className="stat-label">Meals logged</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{dailySummary.total_fiber}g</div>
          <div className="stat-label">Fiber</div>
        </div>
      </div>
    </div>
  );
};

const FoodHistory = ({ onRefresh }) => {
  const [foodEntries, setFoodEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFoodEntries = async () => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/food-entries?user_id=default_user&days=7`);
      const data = await response.json();
      
      if (data.success) {
        setFoodEntries(data.data);
      }
    } catch (err) {
      console.error('Error fetching food entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFoodEntries();
  }, [onRefresh]);

  if (loading) {
    return <div className="loading">Loading food history...</div>;
  }

  return (
    <div className="food-history">
      <h2>Food History</h2>
      {foodEntries.length === 0 ? (
        <div className="empty-state">
          <p>No food entries yet. Start by scanning your first meal!</p>
        </div>
      ) : (
        <div className="history-list">
          {foodEntries.map((entry) => (
            <div key={entry.id} className="history-item">
              <div className="history-image">
                {entry.image_data && (
                  <img 
                    src={`data:image/jpeg;base64,${entry.image_data}`} 
                    alt={entry.category} 
                  />
                )}
              </div>
              <div className="history-content">
                <div className="history-header">
                  <h4>{entry.category}</h4>
                  <span className="history-time">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </span>
                </div>
                {entry.nutrition && (
                  <div className="history-nutrition">
                    <span>Calories: {entry.nutrition.calories}</span>
                    <span>Protein: {entry.nutrition.protein}</span>
                    <span>Carbs: {entry.nutrition.carbs}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const WeightTracker = () => {
  const [weightHistory, setWeightHistory] = useState([]);
  const [currentWeight, setCurrentWeight] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWeightHistory = async () => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/weight-history?user_id=default_user&days=30`);
      const data = await response.json();
      
      if (data.success) {
        setWeightHistory(data.data);
      }
    } catch (err) {
      console.error('Error fetching weight history:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveWeight = async () => {
    if (!currentWeight) return;

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/save-weight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          weight: parseFloat(currentWeight),
          user_id: 'default_user'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentWeight('');
        fetchWeightHistory();
        alert('Weight saved successfully!');
      }
    } catch (err) {
      console.error('Error saving weight:', err);
    }
  };

  useEffect(() => {
    fetchWeightHistory();
  }, []);

  if (loading) {
    return <div className="loading">Loading weight tracker...</div>;
  }

  return (
    <div className="weight-tracker">
      <h2>Weight Tracker</h2>
      
      <div className="weight-input">
        <div className="input-group">
          <input
            type="number"
            placeholder="Enter weight (kg)"
            value={currentWeight}
            onChange={(e) => setCurrentWeight(e.target.value)}
            className="weight-input-field"
          />
          <button onClick={saveWeight} className="btn btn-primary">
            Save Weight
          </button>
        </div>
      </div>

      <div className="weight-history">
        <h3>Weight History</h3>
        {weightHistory.length === 0 ? (
          <div className="empty-state">
            <p>No weight records yet. Add your first weight entry!</p>
          </div>
        ) : (
          <div className="weight-list">
            {weightHistory.map((record) => (
              <div key={record.id} className="weight-item">
                <div className="weight-value">{record.weight} kg</div>
                <div className="weight-date">
                  {new Date(record.timestamp).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleFoodAnalyzed = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard key={refreshTrigger} />;
      case 'camera':
        return <FoodCamera onFoodAnalyzed={handleFoodAnalyzed} />;
      case 'history':
        return <FoodHistory onRefresh={refreshTrigger} />;
      case 'weight':
        return <WeightTracker />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>NutriTrack</h1>
      </header>

      <main className="app-main">
        {renderContent()}
      </main>

      <nav className="bottom-nav">
        <button 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Dashboard</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
        >
          <span className="nav-icon">📸</span>
          <span className="nav-label">Scan</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span className="nav-icon">📝</span>
          <span className="nav-label">History</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'weight' ? 'active' : ''}`}
          onClick={() => setActiveTab('weight')}
        >
          <span className="nav-icon">⚖️</span>
          <span className="nav-label">Weight</span>
        </button>
      </nav>
    </div>
  );
}

export default App;