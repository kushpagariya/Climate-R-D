from flask import Flask
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

mongo_uri = os.getenv("MONGO_URI")

try:
    client = MongoClient(mongo_uri)
    db = client["indravani_weather_db"]

    print("MongoDB Connected Successfully")

except Exception as e:
    print("MongoDB Connection Error:", e)

@app.route("/")
def home():
    return {"message": "Backend Running"}

if __name__ == "__main__":
    app.run(debug=True, port=5000)