import { GoogleGenerativeAI } from '@google/generative-ai'
import { HeatStats, ChatMessage } from '../types'

export function buildSystemPrompt(heatStats: HeatStats, lgaName: string): string {
  const { uhiIntensity, avgNdvi, avgLstCelsius, dateRangeStart, dateRangeEnd } = heatStats

  const uhiDesc =
    uhiIntensity > 3.0 ? 'severe urban heat island' :
    uhiIntensity > 1.5 ? 'moderate urban heat island' :
    uhiIntensity > 0.0 ? 'mild urban heat island' :
    'no significant heat island effect'

  const vegDesc =
    avgNdvi > 0.5 ? 'dense vegetation' :
    avgNdvi > 0.3 ? 'moderate vegetation' :
    avgNdvi > 0.1 ? 'sparse vegetation' :
    'minimal vegetation or urban surface'

  return (
    `You are HeatGPT, an expert in urban heat islands and climate science. ` +
    `The user is exploring ${lgaName} in Australia. ` +
    `Key data: Average LST = ${avgLstCelsius}°C, NDVI = ${avgNdvi} (${vegDesc}), ` +
    `UHI Intensity = ${uhiIntensity}°C (${uhiDesc}). ` +
    `Data period: ${dateRangeStart} to ${dateRangeEnd}. ` +
    `Answer questions clearly and suggest mitigation strategies where relevant.`
  )
}

export async function sendMessage(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: systemPrompt,
  })

  // Convert history (all but last message) to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const lastMessage = messages[messages.length - 1]
  const chat = model.startChat({ history })
  const result = await chat.sendMessage(lastMessage.content)
  return result.response.text()
}
