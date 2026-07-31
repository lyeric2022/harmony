import type { Room } from './house'
import { HOUSE_ID, supabase, supabaseConfigured } from './supabase'

export type RemoteHouse = {
  id: string
  rent: number
  rooms: Room[]
  percents: number[][]
  updated_at: string
}

export async function fetchHouse(): Promise<RemoteHouse | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('harmony_houses')
    .select('id, rent, rooms, percents, updated_at')
    .eq('id', HOUSE_ID)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data as RemoteHouse
}

export async function saveHouse(input: {
  rooms: Room[]
  percents: number[][]
}): Promise<RemoteHouse> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('harmony_houses')
    .upsert(
      {
        id: HOUSE_ID,
        rent: 7560,
        rooms: input.rooms,
        percents: input.percents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('id, rent, rooms, percents, updated_at')
    .single()
  if (error) throw error
  return data as RemoteHouse
}

export { supabaseConfigured }
