import { supabaseServer } from '@/lib/supabase';

export async function getOrganizationBySlug(slug: string): Promise<{ id: string; name: string; slug: string } | null> {
  try {
    const supabase = supabaseServer;

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', slug)
      .single();

    if (error || !organization) {
      console.error('Organization not found for slug:', slug, error);
      return null;
    }

    return organization;
  } catch (error) {
    console.error('Error fetching organization by slug:', error);
    return null;
  }
}