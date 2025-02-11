'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, MicOff } from 'lucide-react'
import { createClient, type ListenLiveClient } from '@deepgram/sdk'

interface TranscriptResponse {
  channel: {
    alternatives: Array<{
      transcript: string
    }>
  }
}

export default function Component() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const deepgramLiveRef = useRef<ListenLiveClient | null>(null)

  useEffect(() => {
    return () => {
      if (deepgramLiveRef.current) {
        deepgramLiveRef.current.finish()
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      console.log('Starting recording...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)

      const deepgram = createClient(process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY as string)
      console.log('Created Deepgram client')
      
      deepgramLiveRef.current = deepgram.listen.live({
        language: 'en',
        smart_format: true,
        model: 'nova-2',
        punctuate: true,
        interim_results: false
      })

      if (deepgramLiveRef.current) {
        console.log('Setting up Deepgram event listeners...')
        
        deepgramLiveRef.current.on('open', () => {
          console.log('Deepgram connection established')
          setIsRecording(true)
          setError(null)

          if (mediaRecorderRef.current) {
            console.log('Setting up MediaRecorder...')
            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0 && deepgramLiveRef.current) {
                console.log('Sending audio data to Deepgram, size:', event.data.size)
                deepgramLiveRef.current.send(event.data)
              }
            }
            mediaRecorderRef.current.start(250)
            console.log('MediaRecorder started')
          }
        })

        deepgramLiveRef.current.on('Results', (message: TranscriptResponse) => {
          console.log('Received transcript:', message)
          const transcript = message.channel?.alternatives[0]?.transcript
          if (transcript) {
            console.log('Setting transcript:', transcript)
            setTranscript((prev) => `${prev} ${transcript}`.trim())
          }
        })

        deepgramLiveRef.current.on('error', (error) => {
          console.error('Deepgram error:', error)
          setError('Transcription error occurred')
        })

        deepgramLiveRef.current.on('close', () => {
          console.log('Deepgram connection closed')
          setIsRecording(false)
        })
      }

    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Error accessing microphone')
    }
  }

  const stopRecording = () => {
    console.log('Stopping recording...')
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      console.log('MediaRecorder stopped')
    }
    if (deepgramLiveRef.current) {
      deepgramLiveRef.current.finish()
      console.log('Deepgram connection finished')
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