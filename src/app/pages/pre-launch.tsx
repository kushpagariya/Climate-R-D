import { useAuth } from "../auth/use-auth";
import { updateProfileApi } from "../api/profile";
import { useState } from "react";
import { X, Upload } from "lucide-react";
import { useNavigate } from "react-router";

export function PreLaunchPage() {
  console.log("PRE LAUNCH PAGE LOADED");
  const navigate = useNavigate();
  const {
    session,
    setHasSeenPreLaunch,
  } = useAuth();

  const [formData, setFormData] = useState({
    missionName: "",
    station: "",
    operator: "",
    launchDate: "",
    launchTime: "",
    temperature: "",
    pressure: "",
    humidity: "",
    windSpeed: "",
    windDirection: "",
    latitude: "",
    longitude: "",
    altitude: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };
  const completePreLaunch = async () => {
    try {
        await setHasSeenPreLaunch();

        navigate("/", {
        replace: true,
        });
    } catch (error) {
        console.error(error);
    }
    };
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              Pre-Launch Mission Setup
            </h1>

            <p className="text-muted-foreground">
              Enter initial atmospheric readings before launch.
            </p>
          </div>

          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg border"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mission Details */}
        <div className="border rounded-xl p-6 mb-6">
          <h2 className="text-xl mb-4">
            Mission Information
          </h2>

          <div className="grid md:grid-cols-2 gap-4">

            <input
              name="missionName"
              placeholder="Mission Name"
              value={formData.missionName}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="station"
              placeholder="Station"
              value={formData.station}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="operator"
              placeholder="Operator Name"
              value={formData.operator}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              type="date"
              name="launchDate"
              value={formData.launchDate}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              type="time"
              name="launchTime"
              value={formData.launchTime}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />
          </div>
        </div>

        {/* Initial Readings */}
        <div className="border rounded-xl p-6 mb-6">
          <h2 className="text-xl mb-4">
            Initial Atmospheric Readings
          </h2>

          <div className="grid md:grid-cols-3 gap-4">

            <input
              name="temperature"
              placeholder="Temperature (°C)"
              value={formData.temperature}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="pressure"
              placeholder="Pressure (hPa)"
              value={formData.pressure}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="humidity"
              placeholder="Humidity (%)"
              value={formData.humidity}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="windSpeed"
              placeholder="Wind Speed (m/s)"
              value={formData.windSpeed}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="windDirection"
              placeholder="Wind Direction (°)"
              value={formData.windDirection}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="latitude"
              placeholder="Latitude"
              value={formData.latitude}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="longitude"
              placeholder="Longitude"
              value={formData.longitude}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />

            <input
              name="altitude"
              placeholder="Altitude (m)"
              value={formData.altitude}
              onChange={handleChange}
              className="border rounded-lg p-3 bg-transparent"
            />
          </div>
        </div>

        {/* CSV Upload */}
        <div className="border rounded-xl p-6 mb-6">
          <h2 className="text-xl mb-4">
            Upload Initial Data
          </h2>

          <label className="flex items-center gap-3 border rounded-lg p-4 cursor-pointer">
            <Upload size={18} />
            <span>Upload CSV File</span>

            <input
              type="file"
              accept=".csv"
              className="hidden"
            />
          </label>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">

          <button
            className="px-6 py-3 rounded-lg bg-cyan-600"
          >
            Save Mission
          </button>

          <button
            onClick={completePreLaunch}
            className="px-6 py-3 rounded-lg border"
          >
            Continue to Dashboard
          </button>

          <button
            onClick={completePreLaunch}
            className="px-6 py-3 rounded-lg border"
          >
            Skip
          </button>

        </div>
      </div>
    </div>
  );
}