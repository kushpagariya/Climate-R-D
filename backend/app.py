import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient

print("Current Directory =", os.getcwd())

load_dotenv()

print("MONGO URI =", os.getenv("MONGO_URI"))

app = Flask(__name__)
CORS(app)

client = MongoClient(os.getenv("MONGO_URI"))

try:
    client.admin.command('ping')
    print("MongoDB Connected Successfully")
except Exception as e:
    print("MongoDB Connection Error:")
    print(e)

db = client["indravani_weather_db"]
users = db["users"]

@app.route("/")
def home():
    return {"message": "Backend Running"}

@app.route("/signup", methods=["POST"])
def signup():

    data = request.json

    user = {
        "name": data.get("name"),
        "email": data.get("email"),
        "password": data.get("password")
    }

    users.insert_one(user)

    return jsonify({
        "message": "User stored successfully"
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)