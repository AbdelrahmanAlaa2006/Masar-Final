import { supabase } from './supabase'

/* Calls the bunny-signed-url Edge Function which:
   1) verifies the user's JWT,
   2) checks the user is allowed to watch this part (grade + overrides),
   3) returns a signed iframe URL that expires in ~4 hours.

   The signing key never leaves the server. */
export async function getBunnySignedUrl({ partId }) {
  const { data, error } = await supabase.functions.invoke('bunny-signed-url', {
    body: { partId },
  })
  if (error) throw error
  if (!data?.url) throw new Error('no signed url returned')
  return data // { url, expires }
}
