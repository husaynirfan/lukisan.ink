import { supabase } from './supabase';

export interface SaveLogoParams {
  imageBlob: Blob;
  prompt: string;
  category: string;
  userId: string;
  aspectRatio?: string;
}

export interface SaveLogoResult {
  success: boolean;
  logoId?: string;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Converts a data URL to a Blob
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Converts a Blob to a data URL
 */
export const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Enhanced logo saving with better error handling and debugging
 */
export const handleSaveGeneratedLogo = async (params: SaveLogoParams): Promise<SaveLogoResult> => {
  const { imageBlob, prompt, category, userId, aspectRatio } = params;

  try {
    console.log('=== STARTING LOGO SAVE PROCESS ===');
    console.log('User ID:', userId);
    console.log('Blob size:', imageBlob.size, 'bytes');
    console.log('Blob type:', imageBlob.type);
    console.log('Category:', category);
    console.log('Aspect ratio:', aspectRatio);

    // Step 1: Validate inputs
    if (!imageBlob || !prompt || !category || !userId) {
      throw new Error('Missing required parameters for saving logo');
    }

    if (imageBlob.size === 0) {
      throw new Error('Image blob is empty');
    }

    if (imageBlob.size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('Image file is too large (max 50MB)');
    }

    // Step 2: Verify user authentication
    console.log('Step 1: Verifying user authentication...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error(`Authentication error: ${sessionError.message}`);
    }
    
    if (!session?.user) {
      throw new Error('User not authenticated - please sign in again');
    }
    
    if (session.user.id !== userId) {
      throw new Error('User ID mismatch - authentication issue');
    }
    
    console.log('✓ User authenticated:', session.user.id);

    // Step 3: Create a unique file path for Supabase Storage
    console.log('Step 2: Generating file path...');
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = imageBlob.type.split('/')[1] || 'png';
    const fileName = `${timestamp}-${randomId}-${category}`;
    const filePath = `logos/${userId}/${fileName}.${fileExtension}`;

    console.log('✓ Generated file path:', filePath);

    // Step 4: Upload the image blob to Supabase Storage with enhanced error handling
    console.log('Step 3: Uploading to Supabase Storage...');
    
    const uploadOptions = {
      contentType: imageBlob.type || 'image/png',
      cacheControl: '3600', // Cache for 1 hour
      upsert: false // Don't overwrite if file exists
    };
    
    console.log('Upload options:', uploadOptions);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(filePath, imageBlob, uploadOptions);

    if (uploadError) {
      console.error('✗ Upload error details:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError
      });
      
      // Provide more specific error messages
      if (uploadError.message.includes('Bucket not found')) {
        throw new Error('Storage bucket not found. Please contact support.');
      } else if (uploadError.message.includes('not allowed') || uploadError.message.includes('permission')) {
        throw new Error('Upload permission denied. Please try signing out and back in.');
      } else if (uploadError.message.includes('size')) {
        throw new Error('File too large. Please use a smaller image.');
      } else if (uploadError.message.includes('type') || uploadError.message.includes('mime')) {
        throw new Error('Invalid file type. Please use PNG, JPEG, or WebP images.');
      } else {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
    }

    console.log('✓ Upload successful:', uploadData);

    // Step 5: Get the permanent public URL for the uploaded image
    console.log('Step 4: Generating public URL...');
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(filePath);

    if (!urlData.publicUrl) {
      throw new Error('Failed to get public URL for uploaded image');
    }

    const publicUrl = urlData.publicUrl;
    console.log('✓ Generated public URL:', publicUrl);

    // Step 6: Verify the uploaded file is accessible
    console.log('Step 5: Verifying file accessibility...');
    try {
      const verifyResponse = await fetch(publicUrl, { method: 'HEAD' });
      if (!verifyResponse.ok) {
        console.warn('⚠ File may not be immediately accessible:', verifyResponse.status);
        // Don't fail the operation, just warn
      } else {
        console.log('✓ File is accessible via public URL');
      }
    } catch (verifyError) {
      console.warn('⚠ Could not verify file accessibility:', verifyError);
      // Don't fail the operation, just warn
    }

    // Step 7: Save the logo metadata to the database with the permanent URL
    console.log('Step 6: Saving logo metadata to database...');
    const logoData = {
      user_id: userId,
      prompt: aspectRatio ? `${prompt} (${aspectRatio})` : prompt,
      category: category,
      image_url: publicUrl, // This is the permanent URL, not a blob URL
      aspect_ratio: aspectRatio || '1:1',
      created_at: new Date().toISOString()
    };

    console.log('Logo data to insert:', logoData);

    const { data: insertData, error: insertError } = await supabase
      .from('logo_generations')
      .insert(logoData)
      .select('id')
      .single();

    if (insertError) {
      console.error('✗ Database insertion error:', insertError);
      
      // If database save fails, clean up the uploaded file
      console.log('Cleaning up uploaded file due to database error...');
      try {
        await supabase.storage
          .from('generated-images')
          .remove([filePath]);
        console.log('✓ Cleanup successful');
      } catch (cleanupError) {
        console.error('✗ Cleanup failed:', cleanupError);
      }
      
      throw new Error(`Failed to save logo to database: ${insertError.message}`);
    }

    console.log('✓ Logo saved successfully with ID:', insertData.id);
    console.log('=== LOGO SAVE PROCESS COMPLETED ===');

    // Step 8: Return success result
    return {
      success: true,
      logoId: insertData.id,
      publicUrl: publicUrl,
      storagePath: filePath
    };

  } catch (error: any) {
    console.error('=== LOGO SAVE PROCESS FAILED ===');
    console.error('Error details:', error);
    
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while saving the logo'
    };
  }
};

/**
 * Helper function to convert a URL to a Blob
 * Enhanced with better error handling and CORS support
 */
export const urlToBlob = async (url: string): Promise<Blob> => {
  try {
    console.log('Converting URL to blob:', url.substring(0, 100) + '...');
    
    // Check if it's a data URL
    if (url.startsWith('data:')) {
      console.log('Converting data URL to blob');
      return dataUrlToBlob(url);
    }

    // For regular URLs, use fetch with proper headers
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('✓ URL converted to blob, size:', blob.size, 'bytes');
    
    return blob;
  } catch (error: any) {
    console.error('Error converting URL to blob:', error);
    throw new Error(`Failed to process image for saving: ${error.message}`);
  }
};

/**
 * Helper function to delete a logo from both storage and database
 * Enhanced with better error handling
 */
export const deleteSavedLogo = async (logoId: string, storagePath: string): Promise<boolean> => {
  try {
    console.log('=== DELETING SAVED LOGO ===');
    console.log('Logo ID:', logoId);
    console.log('Storage path:', storagePath);

    // Delete from storage first
    console.log('Deleting from storage...');
    const { error: storageError } = await supabase.storage
      .from('generated-images')
      .remove([storagePath]);

    if (storageError) {
      console.warn('⚠ Failed to delete from storage:', storageError);
      // Continue with database deletion even if storage fails
    } else {
      console.log('✓ Deleted from storage');
    }

    // Delete from database
    console.log('Deleting from database...');
    const { error: dbError } = await supabase
      .from('logo_generations')
      .delete()
      .eq('id', logoId);

    if (dbError) {
      console.error('✗ Failed to delete from database:', dbError);
      return false;
    }

    console.log('✓ Logo deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting saved logo:', error);
    return false;
  }
};