'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, MicOff } from 'lucide-react'

// Replace with your actual Deepgram API key
const DEEPGRAM_API_KEY = 'f280117449140f611ffefddc5af84b9d2d886b2a'

export default function Component() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)

      socketRef.current = new WebSocket('wss://api.deepgram.com/v1/listen', [
        'token',
        DEEPGRAM_API_KEY,
      ])

      socketRef.current.onopen = () => {
        console.log('WebSocket connection established')
        setIsRecording(true)
        setError(null)

        mediaRecorderRef.current!.ondataavailable = (event) => {
          if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(event.data)
          }
        }

        mediaRecorderRef.current!.start(250)
      }

      socketRef.current.onmessage = (message) => {
        const received = JSON.parse(message.data)
        const transcript = received.channel.alternatives[0].transcript
        if (transcript) {
          setTranscript((prev) => prev + ' ' + transcript)
        }
      }

      socketRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('WebSocket error occurred')
      }

      socketRef.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason)
        setIsRecording(false)
        if (event.code !== 1000) {
          setError(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`)
        }
      }
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Error accessing microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    }
    if (socketRef.current) {
      socketRef.current.close()
    }
    setIsRecording(false)
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Voice Transcription</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button 
            onClick={isRecording ? stopRecording : startRecording}
            className="w-full"
          >
            {isRecording ? (
              <>
                <MicOff className="mr-2 h-4 w-4" /> Stop Recording
              </>
            ) : (
              <>
                <Mic className="mr-2 h-4 w-4" /> Start Recording
              </>
            )}
          </Button>
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          <div className="bg-muted p-4 rounded-md h-40 overflow-y-auto">
            <p className="text-sm">{transcript || 'Transcript will appear here...'}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Click the button to start or stop recording. Speak clearly into your microphone.
        </p>
      </CardFooter>
    </Card>
  )
}