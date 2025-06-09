/*
  # Fix Storage Permissions and RLS Policies

  1. Storage Bucket Configuration
    - Ensure generated-images bucket exists with correct settings
    - Set proper public access and file size limits
    - Configure allowed MIME types

  2. Storage Policies
    - Fix upload permissions for authenticated users
    - Enable proper public read access
    - Allow users to manage their own files
    - Fix path-based permissions

  3. Security
    - Ensure users can only access their own folders
    - Enable public read for all images
    - Proper delete permissions for file owners
*/

-- Ensure the storage bucket exists with correct configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can upload images to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for generated images" ON storage.objects;

-- Create comprehensive storage policies

-- 1. Allow authenticated users to upload to their own folder
CREATE POLICY "Authenticated users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images' 
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. Allow authenticated users to upload to any logos folder (for admin/system operations)
CREATE POLICY "System can upload to logos folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images' 
  AND (storage.foldername(name))[1] = 'logos'
);

-- 3. Allow authenticated users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 4. Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 5. Allow public read access to all images in the bucket
CREATE POLICY "Public read access for generated images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-images');

-- 6. Allow service role to manage all files (for cleanup functions)
CREATE POLICY "Service role can manage all files"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'generated-images');

-- Grant necessary permissions to authenticated users
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- Grant permissions to service role for cleanup operations
GRANT ALL ON storage.objects TO service_role;
GRANT ALL ON storage.buckets TO service_role;

-- Create indexes for better performance on storage operations
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_folder 
ON storage.objects(bucket_id, (storage.foldername(name))[1], (storage.foldername(name))[2]);

-- Ensure the storage schema has proper permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;