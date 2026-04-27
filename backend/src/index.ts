import dotenv from "dotenv"
dotenv.config()

import { initEarthEngine } from "./services/earthEngineService"
import app from "./app"

const PORT = process.env.PORT || 3001

async function start() {
  try {
    console.log("Initialising Earth Engine...")
    await initEarthEngine()
    console.log("Earth Engine ready")
  } catch (err: any) {
    console.warn("Earth Engine failed to initialise:", err.message)
  }

  app.listen(PORT, () => {
    console.log(`HeatGPT API listening on port ${PORT}`)
  })
}

start()