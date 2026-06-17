Design a premium, research-grade Weather Intelligence and Radiosonde Analytics Platform called:

# INDRAVANI WEATHER INTELLIGENCE

Purpose:
A modern atmospheric sounding and weather intelligence platform built using radiosonde observations for scientific analysis, upper-air monitoring, and future AI-based weather forecasting.

The platform should look like a fusion of:

* NOAA Upper Air Systems
* DWD (Germany)
* JMA (Japan)
* NASA Earth Data
* Windy
* Palantir
* Bloomberg Terminal
* Modern fintech dashboards

The application should feel like a professional meteorological operations center rather than a student project.

====================================================
DESIGN SYSTEM
=============

Theme:

* Premium scientific dashboard
* Dark mode by default
* Optional light mode
* Deep navy background
* Cyan, teal, and blue scientific accents
* Glassmorphism cards
* Soft shadows
* Modern typography
* Research-grade UI

Requirements:

* Responsive desktop-first design
* Smooth animations
* Interactive visualizations
* Professional appearance suitable for:

  * Meteorological Departments
  * Research Institutions
  * Engineering Project Demonstrations
  * Atmospheric Science Presentations

====================================================
DATA SOURCE
===========

The platform operates entirely on radiosonde sounding observations.

Available variables:

* Pressure (hPa)
* Geopotential Height (m)
* Temperature (°C)
* Dew Point Temperature (°C)
* Ice Point Temperature (°C)
* Relative Humidity (%)
* Humidity wrt Ice (%)
* Mixing Ratio (g/kg)
* Wind Direction (degrees)
* Wind Speed (m/s)

All calculations, visualizations, and atmospheric detections must be derived from these variables.

No external weather APIs are required.

====================================================
PAGE 1
ATMOSPHERIC ANALYTICS DASHBOARD
===============================

HEADER

* Project Name: Indravani Weather Intelligence
* Date Selector
* Station Selector
* Refresh Button
* Export Button

====================================================
TOP KPI SECTION
===============

Display:

* Current Temperature
* Current Pressure
* Relative Humidity
* Wind Speed
* Geopotential Height
* Sounding Status

====================================================
GLOBAL CHART FEATURES
=====================

Every chart must support:

* Zoom In
* Zoom Out
* Mouse Wheel Zoom
* Drag Selection Zoom
* Pan Navigation
* Reset Zoom

Dynamic Scaling:

Example:

* Full profile: 0–20 km
* Zoomed profile: 2500–3500 m

Units and axes should automatically adapt.

====================================================
SECTION 1
ATMOSPHERIC PROFILE
===================

Large sounding profile chart displaying:

* Temperature vs Height
* Dew Point vs Height
* Ice Point vs Height

Display markers for:

* Freezing Level
* LCL
* Tropopause

Interactive and zoomable.

====================================================
SECTION 2
WIND ANALYTICS
==============

Left:

Wind Rose

Display:

* Wind Direction Distribution
* Wind Speed Categories

Right:

Wind Profile

Display:

* Wind Speed vs Height
* Wind Direction vs Height

Optional Hodograph Toggle

====================================================
SECTION 3
MOISTURE ANALYTICS
==================

Left:

Humidity Profile

Display:

* Relative Humidity vs Height
* Humidity wrt Ice vs Height

Right:

Mixing Ratio Profile

Display:

* Mixing Ratio vs Height

====================================================
SECTION 4
ATMOSPHERIC CONDITIONS
======================

Left:

Pressure Profile

Display:

* Pressure vs Height

Right:

Scatter Plot

Display:

* Temperature vs Relative Humidity

====================================================
SECTION 5
CORRELATION INTELLIGENCE
========================

Full-width correlation heatmap.

Include all atmospheric variables.

Interactive tooltips and explanations.

====================================================
PAGE 2
LIVE RADIOSONDE MISSION CONTROL
===============================

Purpose:

Real-time weather balloon tracking and upper-air sounding operations.

====================================================
SECTION 1
LIVE FLIGHT MAP
===============

Large mission-control style map.

Display:

* Launch Station
* Current Balloon Position
* Historical Flight Path
* Predicted Flight Path
* Predicted Landing Zone
* Distance Rings
* Altitude Labels
* Time Markers
* Animated Balloon Icon
* Live Status Indicator

Controls:

* Zoom In
* Zoom Out
* Recenter
* Follow Balloon
* Fullscreen

Layers:

* Balloon Track
* Wind Layer
* Temperature Layer
* Pressure Layer
* Humidity Layer

No satellite imagery.
No radar imagery.
No third-party forecast layers.

====================================================
SECTION 2
LIVE TELEMETRY
==============

Display:

* Current Pressure
* Current Altitude
* Current Temperature
* Current Dew Point
* Current Ice Point
* Relative Humidity
* Humidity wrt Ice
* Mixing Ratio
* Wind Speed
* Wind Direction

Mission Status:

* Ascending
* Descending
* Mission Complete

====================================================
SECTION 3
FLIGHT METRICS
==============

Display:

* Mission Duration
* Distance Travelled
* Vertical Rate
* Horizontal Speed
* Current Heading
* Maximum Altitude Reached
* Estimated Burst Altitude
* Estimated Landing Position

====================================================
SECTION 4
DETECTED ATMOSPHERIC EVENTS
===========================

Automatically detect and display:

* Temperature Inversion
* Strong Wind Shear
* High Moisture Layer
* Dry Air Intrusion
* Elevated Mixing Ratio Layer
* Freezing Layer
* Tropopause
* Rapid Temperature Lapse Rate
* Stable Atmospheric Layer
* Potential Convective Layer

Display as scientific alert cards.

Include:

* Event Name
* Severity
* Height Range
* Pressure Range
* Description

====================================================
SECTION 5
SOUNDING SUMMARY
================

Display:

* Surface Temperature
* Surface Pressure
* Surface Humidity
* Maximum Wind Speed
* Maximum Altitude
* Tropopause Height
* Freezing Level
* LCL Height
* Moisture Layer Depth

====================================================
FUTURE EXPANSION
================

Design the architecture so future modules can be added without redesigning the UI:

* AI Forecasting
* AI Insights
* AI Anomaly Detection
* Weather Prediction Models
* Multi-Station Comparison
* Historical Sounding Analysis
* Climate Analytics

Keep placeholder integration points but do not implement AI features yet.

The final result should feel like a professional atmospheric intelligence platform used by meteorological agencies and research organizations.
