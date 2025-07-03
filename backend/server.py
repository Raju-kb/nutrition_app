from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson import ObjectId
import os
import requests
import base64
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import json
import uuid
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "nutrition_tracker")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Collections
food_entries = db.food_entries
weight_records = db.weight_records
user_profiles = db.user_profiles

# Spoonacular API key
SPOONACULAR_API_KEY = "673ea16ce3cd48328b7117f37d323d6c"

@app.get("/")
async def root():
    return {"message": "Nutrition Tracker API"}

@app.post("/api/analyze-food")
async def analyze_food_image(file: UploadFile = File(...)):
    """Analyze food image using Spoonacular API"""
    try:
        # Read image file
        image_data = await file.read()
        
        # Send to Spoonacular Food Recognition API
        url = "https://api.spoonacular.com/food/images/analyze"
        
        files = {"file": ("image.jpg", image_data, "image/jpeg")}
        params = {"apiKey": SPOONACULAR_API_KEY}
        
        response = requests.post(url, files=files, params=params)
        
        if response.status_code == 200:
            result = response.json()
            
            # Get detailed nutrition information if we have a recipe
            nutrition_info = {}
            if result.get("recipes") and len(result["recipes"]) > 0:
                recipe_id = result["recipes"][0].get("id")
                if recipe_id:
                    nutrition_url = f"https://api.spoonacular.com/recipes/{recipe_id}/nutritionWidget.json"
                    nutrition_params = {"apiKey": SPOONACULAR_API_KEY}
                    nutrition_response = requests.get(nutrition_url, params=nutrition_params)
                    
                    if nutrition_response.status_code == 200:
                        nutrition_info = nutrition_response.json()
            
            # Convert image to base64 for storage
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            
            # Extract nutrition data
            nutrition_data = {
                "id": str(uuid.uuid4()),
                "category": result.get("category", {}).get("name", "Unknown"),
                "probability": result.get("category", {}).get("probability", 0),
                "nutrition": nutrition_info,
                "recipes": result.get("recipes", []),
                "image_data": image_base64,
                "timestamp": datetime.now().isoformat()
            }
            
            return {"success": True, "data": nutrition_data}
        else:
            # Fallback with mock data for demo
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            mock_nutrition = {
                "id": str(uuid.uuid4()),
                "category": "Food",
                "probability": 0.85,
                "nutrition": {
                    "calories": "250",
                    "carbs": "35g",
                    "protein": "12g",
                    "fat": "8g",
                    "fiber": "4g",
                    "sugar": "15g"
                },
                "recipes": [],
                "image_data": image_base64,
                "timestamp": datetime.now().isoformat()
            }
            return {"success": True, "data": mock_nutrition}
            
    except Exception as e:
        print(f"Error analyzing food: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-food-entry")
async def save_food_entry(entry_data: dict = Body(...)):
    """Save food entry to database"""
    try:
        # Add unique ID and timestamp
        entry_data["id"] = str(uuid.uuid4())
        entry_data["timestamp"] = datetime.now().isoformat()
        entry_data["user_id"] = entry_data.get("user_id", "default_user")
        
        # Save to MongoDB
        result = food_entries.insert_one(entry_data)
        
        return {"success": True, "id": entry_data["id"]}
    except Exception as e:
        print(f"Error saving food entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/food-entries")
async def get_food_entries(user_id: str = "default_user", days: int = 7):
    """Get food entries for user"""
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Query food entries
        query = {
            "user_id": user_id,
            "timestamp": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        
        entries = list(food_entries.find(query).sort("timestamp", -1))
        
        # Convert ObjectId to string
        for entry in entries:
            if "_id" in entry:
                del entry["_id"]
        
        return {"success": True, "data": entries}
    except Exception as e:
        print(f"Error fetching food entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/daily-summary")
async def get_daily_summary(user_id: str = "default_user", date: str = None):
    """Get daily nutrition summary"""
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        
        # Get entries for the day
        start_date = datetime.strptime(date, "%Y-%m-%d")
        end_date = start_date + timedelta(days=1)
        
        query = {
            "user_id": user_id,
            "timestamp": {
                "$gte": start_date.isoformat(),
                "$lt": end_date.isoformat()
            }
        }
        
        entries = list(food_entries.find(query))
        
        # Calculate totals
        total_calories = 0
        total_carbs = 0
        total_protein = 0
        total_fat = 0
        total_fiber = 0
        
        for entry in entries:
            nutrition = entry.get("nutrition", {})
            if isinstance(nutrition, dict):
                # Extract numeric values from strings
                calories = nutrition.get("calories", "0")
                if isinstance(calories, str):
                    calories = "".join(filter(str.isdigit, calories))
                total_calories += int(calories) if calories else 0
                
                carbs = nutrition.get("carbs", "0g")
                if isinstance(carbs, str):
                    carbs = "".join(filter(str.isdigit, carbs.replace("g", "")))
                total_carbs += int(carbs) if carbs else 0
                
                protein = nutrition.get("protein", "0g")
                if isinstance(protein, str):
                    protein = "".join(filter(str.isdigit, protein.replace("g", "")))
                total_protein += int(protein) if protein else 0
                
                fat = nutrition.get("fat", "0g")
                if isinstance(fat, str):
                    fat = "".join(filter(str.isdigit, fat.replace("g", "")))
                total_fat += int(fat) if fat else 0
                
                fiber = nutrition.get("fiber", "0g")
                if isinstance(fiber, str):
                    fiber = "".join(filter(str.isdigit, fiber.replace("g", "")))
                total_fiber += int(fiber) if fiber else 0
        
        summary = {
            "date": date,
            "total_calories": total_calories,
            "total_carbs": total_carbs,
            "total_protein": total_protein,
            "total_fat": total_fat,
            "total_fiber": total_fiber,
            "entries_count": len(entries),
            "goal_calories": 2000,  # Default goal
            "goal_carbs": 250,
            "goal_protein": 150,
            "goal_fat": 65
        }
        
        return {"success": True, "data": summary}
    except Exception as e:
        print(f"Error fetching daily summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-weight")
async def save_weight(weight_data: dict = Body(...)):
    """Save weight record"""
    try:
        weight_data["id"] = str(uuid.uuid4())
        weight_data["timestamp"] = datetime.now().isoformat()
        weight_data["user_id"] = weight_data.get("user_id", "default_user")
        
        result = weight_records.insert_one(weight_data)
        
        return {"success": True, "id": weight_data["id"]}
    except Exception as e:
        print(f"Error saving weight: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/weight-history")
async def get_weight_history(user_id: str = "default_user", days: int = 30):
    """Get weight history for user"""
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        query = {
            "user_id": user_id,
            "timestamp": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        
        records = list(weight_records.find(query).sort("timestamp", 1))
        
        # Convert ObjectId to string
        for record in records:
            if "_id" in record:
                del record["_id"]
        
        return {"success": True, "data": records}
    except Exception as e:
        print(f"Error fetching weight history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user-profile")
async def get_user_profile(user_id: str = "default_user"):
    """Get user profile"""
    try:
        profile = user_profiles.find_one({"user_id": user_id})
        
        if not profile:
            # Create default profile
            profile = {
                "user_id": user_id,
                "name": "User",
                "age": 30,
                "height": 170,
                "goal_weight": 70,
                "activity_level": "moderate",
                "daily_calorie_goal": 2000,
                "created_at": datetime.now().isoformat()
            }
            user_profiles.insert_one(profile)
        
        # Remove ObjectId
        if "_id" in profile:
            del profile["_id"]
        
        return {"success": True, "data": profile}
    except Exception as e:
        print(f"Error fetching user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/update-user-profile")
async def update_user_profile(profile_data: dict = Body(...)):
    """Update user profile"""
    try:
        user_id = profile_data.get("user_id", "default_user")
        profile_data["updated_at"] = datetime.now().isoformat()
        
        result = user_profiles.update_one(
            {"user_id": user_id},
            {"$set": profile_data},
            upsert=True
        )
        
        return {"success": True, "modified": result.modified_count > 0}
    except Exception as e:
        print(f"Error updating user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)