import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/projects/:id
 *
 * Server-side project deletion using the authenticated server client.
 * This properly handles RLS policies since the server client carries
 * the user's session from cookies.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify the user owns this project
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Delete — cascades to line_items, chat_messages, project_files, estimate_adjustments
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Supabase delete error:', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete project' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Project deletion error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
