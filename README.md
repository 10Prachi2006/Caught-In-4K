# Gujarat Police IVMAP

## Integrated Video Management & Analytics Platform

An AI-powered CCTV video analytics platform for vehicle detection, license plate recognition, watchlist matching, alert generation, cross-camera vehicle tracking, and investigation support.

---

## Problem

Gujarat has a large and distributed CCTV ecosystem across multiple departments and districts.

Finding a suspicious vehicle across multiple camera feeds can require manual monitoring and searching.

IVMAP aims to provide a centralized platform that converts CCTV video into searchable vehicle intelligence.

---

## Core Workflow

CCTV Video
    ↓
Vehicle Detection
    ↓
License Plate Detection
    ↓
OCR / ANPR
    ↓
Plate Normalization
    ↓
Watchlist Matching
    ↓
Alert Generation
    ↓
Vehicle Search
    ↓
Cross-Camera Correlation
    ↓
GIS Route Visualization

---

## MVP

The current prototype focuses on:

- Vehicle detection
- License plate detection
- OCR-based number plate recognition
- Plate normalization
- Vehicle sighting storage
- Watchlist matching
- Alert generation
- Vehicle search
- Cross-camera sightings
- Basic GIS route visualization

The MVP uses prerecorded CCTV videos to demonstrate the complete pipeline.

---

## Architecture

See:

`docs/architecture/`

---

## Technology Stack

### AI / Computer Vision
- Python
- YOLO
- OpenCV
- OCR

### Backend
- FastAPI
- PostgreSQL

### Frontend
- React
- Vite
- Tailwind CSS

### GIS
- Leaflet

---

## Project Structure

```text
ai/          AI and computer vision pipeline
backend/     FastAPI and PostgreSQL
frontend/    React dashboard
gis/         Camera and route data
data/        Sample data and generated outputs
docs/        Architecture, PPT and demo documentation
scripts/     Setup and utility scripts
tests/       Testing