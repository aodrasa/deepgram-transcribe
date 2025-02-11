'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, MicOff, Trash2 } from 'lucide-react'
import { createClient, type ListenLiveClient } from '@deepgram/sdk'

interface TranscriptResponse {
  channel: {
    alternatives: Array<{
      transcript: string
      words: Array<{
        word: string
        speaker: number
        start: number
        end: number
        punctuated: boolean
        is_final: boolean
      }>
    }>
  }
}

interface TranscriptSegment {
  speaker: number
  text: string
  isComplete: boolean
  committed?: boolean
}

export default function Component() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentUtterance, setCurrentUtterance] = useState<TranscriptSegment | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const deepgramLiveRef = useRef<ListenLiveClient | null>(null)

  // Function to capitalize first letter of a sentence
  const capitalizeFirstLetter = (text: string) => {
    return text.replace(/(^\w|\.\s+\w)/g, letter => letter.toUpperCase());
  };

  // Function to update or create a new utterance
  const updateUtterance = (speaker: number, text: string, isComplete: boolean) => {
    console.log('Updating utterance:', { speaker, text, isComplete });
    setCurrentUtterance(prev => {
      // If no previous utterance or speaker changed, flush previous utterance if needed
      if (!prev || prev.speaker !== speaker) {
        if (prev && !prev.committed) {
          console.log('Speaker changed, flushing previous utterance:', prev);
          setTranscriptSegments(segments => {
            const flushed = { ...prev, isComplete: true, committed: true };
            console.log('Flushed utterance:', flushed);
            return [...segments, flushed];
          });
        }
        const newUtterance = { speaker, text: capitalizeFirstLetter(text), isComplete, committed: false };
        console.log('Created new utterance:', newUtterance);
        return newUtterance;
      }
      
      // Same speaker, update text
      const updatedUtterance = { ...prev, text: capitalizeFirstLetter(text), isComplete, committed: false };
      console.log('Updated existing utterance:', updatedUtterance);
      return updatedUtterance;
    });
  };

  // Effect to handle completed utterances
  useEffect(() => {
    if (currentUtterance?.isComplete && !currentUtterance.committed) {
      console.log('Handling completed utterance:', currentUtterance);
      setTranscriptSegments(segments => {
        const flushed = { ...currentUtterance, committed: true };
        console.log('Final transcript segments:', [...segments, flushed]);
        return [...segments, flushed];
      });
      setCurrentUtterance(null);
    }
  }, [currentUtterance]);

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
      setCurrentUtterance(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)

      const deepgram = createClient(process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY as string)
      console.log('Created Deepgram client')
      
      deepgramLiveRef.current = deepgram.listen.live({
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        diarize: true,
        diarize_version: '3',
        num_speakers: 2,
        interim_results: true,
        utterance_end_ms: 2000,
        min_utterance_length: 1,
        max_utterance_length: 15,
        punctuate: true,
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
          console.log('Received transcript:', message);
          if (message.channel?.alternatives[0]?.words) {
            const words = message.channel.alternatives[0].words;
            if (words.length > 0) {
              // Split words into segments based on speaker changes
              const segments = [];
              let segment = [words[0]];
              for (let i = 1; i < words.length; i++) {
                if (words[i].speaker === segment[segment.length - 1].speaker) {
                  segment.push(words[i]);
                } else {
                  segments.push(segment);
                  segment = [words[i]];
                }
              }
              segments.push(segment);
              
              // If there's an existing currentUtterance with the same speaker as the first segment, merge them
              if (currentUtterance && segments[0][0].speaker === currentUtterance.speaker) {
                const mergedText = `${currentUtterance.text} ${segments[0].map(w => w.word).join(' ')}`;
                segments[0] = [{ ...segments[0][0], word: mergedText, is_final: segments[0][segments[0].length - 1].is_final }];
              }
              
              // Process all segments except the last as complete utterances using a for...of loop
              for (const seg of segments.slice(0, -1)) {
                const segText = seg.map(w => w.word).join(' ');
                const segSpeaker = seg[0].speaker;
                updateUtterance(segSpeaker, segText, true);
              }
              
              // Process the last segment as the current utterance update
              const lastSegment = segments[segments.length - 1];
              const lastSpeaker = lastSegment[0].speaker;
              const lastText = lastSegment.map(w => w.word).join(' ');
              const isComplete = lastSegment[lastSegment.length - 1].is_final;
              updateUtterance(lastSpeaker, lastText, isComplete);
            }
          }
        })

        deepgramLiveRef.current.on('error', (error) => {
          console.error('Deepgram error:', error)
          setError('Transcription error occurred')
        })

        deepgramLiveRef.current.on('close', () => {
          console.log('Deepgram connection closed');
          setIsRecording(false);
          if (currentUtterance && !currentUtterance.committed) {
            console.log('Saving final utterance:', currentUtterance);
            setTranscriptSegments(segments => {
              const flushed = { ...currentUtterance, isComplete: true, committed: true };
              console.log('Updated transcript segments:', [...segments, flushed]);
              return [...segments, flushed];
            });
            setCurrentUtterance(null);
          }
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

  const clearTranscript = () => {
    setTranscriptSegments([]);
    setCurrentUtterance(null);
  };

  return (
    <div className="min-h-screen p-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Voice Transcription</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={clearTranscript}
            className="text-gray-500 hover:text-red-600"
            disabled={isRecording}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Transcript
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
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
            <div className="bg-muted p-6 rounded-lg h-[60vh] overflow-y-auto space-y-4">
              {[...transcriptSegments, ...(currentUtterance ? [currentUtterance] : [])].map((segment, index) => (
                <div 
                  key={`${segment.speaker}-${index}`}
                  className={`p-4 rounded-lg shadow-sm ${
                    segment.speaker === 0 ? 'bg-blue-50 ml-auto max-w-[80%]' : 'bg-gray-50 mr-auto max-w-[80%]'
                  } ${!segment.isComplete ? 'opacity-70' : ''}`}
                >
                  <p className="text-sm font-semibold mb-2 text-gray-600">Speaker {segment.speaker + 1}</p>
                  <p className="text-base">{segment.text}</p>
                </div>
              ))}
              {transcriptSegments.length === 0 && !currentUtterance && (
                <p className="text-center text-muted-foreground">Transcript will appear here...</p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Click the button to start or stop recording. Speak clearly into your microphone.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}