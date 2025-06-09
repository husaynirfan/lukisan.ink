import { supabase } from './supabase';

/**
 * Comprehensive storage verification and testing utility
 */

export interface StorageVerificationResult {
  bucketExists: boolean;
  bucketPublic: boolean;
  canUpload: boolean;
  canRead: boolean;
  canDelete: boolean;
  testFileUrl?: string;
  errors: string[];
  permissions: {
    upload: boolean;
    read: boolean;
    delete: boolean;
  };
}

/**
 * Verifies the storage bucket configuration and permissions
 */
export const verifyStorageBucket = async (userId: string): Promise<StorageVerificationResult> => {
  const result: StorageVerificationResult = {
    bucketExists: false,
    bucketPublic: false,
    canUpload: false,
    canRead: false,
    canDelete: false,
    errors: [],
    permissions: {
      upload: false,
      read: false,
      delete: false
    }
  };

  try {
    console.log('=== STORAGE VERIFICATION STARTING ===');
    console.log('User ID:', userId);

    // Step 1: Check if bucket exists
    console.log('Step 1: Checking if bucket exists...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      result.errors.push(`Failed to list buckets: ${bucketsError.message}`);
      console.error('Bucket listing error:', bucketsError);
    } else {
      const generatedImagesBucket = buckets?.find(bucket => bucket.id === 'generated-images');
      if (generatedImagesBucket) {
        result.bucketExists = true;
        result.bucketPublic = generatedImagesBucket.public;
        console.log('✓ Bucket exists:', generatedImagesBucket);
      } else {
        result.errors.push('Bucket "generated-images" does not exist');
        console.error('✗ Bucket "generated-images" not found');
        console.log('Available buckets:', buckets?.map(b => b.id));
      }
    }

    // Step 2: Test directory structure
    console.log('Step 2: Testing directory structure...');
    const testPath = `logos/${userId}/test-${Date.now()}.txt`;
    console.log('Test path:', testPath);

    // Step 3: Test upload permission
    console.log('Step 3: Testing upload permission...');
    const testContent = new Blob(['Test file for storage verification'], { type: 'text/plain' });
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(testPath, testContent, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      result.errors.push(`Upload test failed: ${uploadError.message}`);
      console.error('✗ Upload test failed:', uploadError);
    } else {
      result.canUpload = true;
      result.permissions.upload = true;
      console.log('✓ Upload test successful:', uploadData);

      // Step 4: Test read permission
      console.log('Step 4: Testing read permission...');
      const { data: publicUrlData } = supabase.storage
        .from('generated-images')
        .getPublicUrl(testPath);

      if (publicUrlData.publicUrl) {
        result.testFileUrl = publicUrlData.publicUrl;
        console.log('✓ Public URL generated:', publicUrlData.publicUrl);

        // Test if the URL is actually accessible
        try {
          const response = await fetch(publicUrlData.publicUrl);
          if (response.ok) {
            result.canRead = true;
            result.permissions.read = true;
            console.log('✓ File is publicly accessible');
          } else {
            result.errors.push(`File not accessible via public URL: ${response.status}`);
            console.error('✗ File not accessible:', response.status, response.statusText);
          }
        } catch (fetchError: any) {
          result.errors.push(`Failed to fetch public URL: ${fetchError.message}`);
          console.error('✗ Fetch error:', fetchError);
        }
      } else {
        result.errors.push('Failed to generate public URL');
        console.error('✗ Failed to generate public URL');
      }

      // Step 5: Test delete permission
      console.log('Step 5: Testing delete permission...');
      const { error: deleteError } = await supabase.storage
        .from('generated-images')
        .remove([testPath]);

      if (deleteError) {
        result.errors.push(`Delete test failed: ${deleteError.message}`);
        console.error('✗ Delete test failed:', deleteError);
      } else {
        result.canDelete = true;
        result.permissions.delete = true;
        console.log('✓ Delete test successful');
      }
    }

    // Step 6: Test list files in user directory
    console.log('Step 6: Testing list files in user directory...');
    const userDir = `logos/${userId}`;
    const { data: files, error: listError } = await supabase.storage
      .from('generated-images')
      .list(userDir);

    if (listError) {
      result.errors.push(`List files failed: ${listError.message}`);
      console.error('✗ List files failed:', listError);
    } else {
      console.log('✓ List files successful:', files?.length || 0, 'files found');
    }

  } catch (error: any) {
    result.errors.push(`Verification failed: ${error.message}`);
    console.error('=== STORAGE VERIFICATION ERROR ===', error);
  }

  console.log('=== STORAGE VERIFICATION COMPLETE ===');
  console.log('Results:', result);
  
  return result;
};

/**
 * Creates the storage bucket if it doesn't exist
 */
export const createStorageBucket = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('=== CREATING STORAGE BUCKET ===');

    const { data, error } = await supabase.storage.createBucket('generated-images', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 52428800 // 50MB
    });

    if (error) {
      console.error('✗ Failed to create bucket:', error);
      return { success: false, error: error.message };
    }

    console.log('✓ Bucket created successfully:', data);
    return { success: true };

  } catch (error: any) {
    console.error('✗ Bucket creation error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Tests the complete logo upload and save process
 */
export const testLogoUploadProcess = async (userId: string): Promise<{
  success: boolean;
  logoId?: string;
  publicUrl?: string;
  error?: string;
}> => {
  try {
    console.log('=== TESTING COMPLETE LOGO UPLOAD PROCESS ===');
    console.log('User ID:', userId);

    // Create a test image blob
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Draw a simple test image
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '20px Arial';
    ctx.fillText('TEST', 25, 55);

    // Convert to blob
    const testBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });

    console.log('Test blob created, size:', testBlob.size);

    // Import the handleSaveGeneratedLogo function
    const { handleSaveGeneratedLogo } = await import('./logoSaver');

    // Test the complete save process
    const saveResult = await handleSaveGeneratedLogo({
      imageBlob: testBlob,
      prompt: 'Test logo upload verification',
      category: 'test',
      userId: userId,
      aspectRatio: '1:1'
    });

    console.log('Save result:', saveResult);

    if (saveResult.success) {
      console.log('✓ Complete upload process successful');
      console.log('✓ Logo ID:', saveResult.logoId);
      console.log('✓ Public URL:', saveResult.publicUrl);
      console.log('✓ Storage Path:', saveResult.storagePath);

      return {
        success: true,
        logoId: saveResult.logoId,
        publicUrl: saveResult.publicUrl
      };
    } else {
      console.error('✗ Upload process failed:', saveResult.error);
      return {
        success: false,
        error: saveResult.error
      };
    }

  } catch (error: any) {
    console.error('=== LOGO UPLOAD TEST ERROR ===', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Comprehensive storage diagnostics
 */
export const runStorageDiagnostics = async (userId: string) => {
  console.log('=== RUNNING COMPREHENSIVE STORAGE DIAGNOSTICS ===');
  
  // 1. Verify bucket configuration
  const bucketVerification = await verifyStorageBucket(userId);
  
  // 2. Test complete upload process
  const uploadTest = await testLogoUploadProcess(userId);
  
  // 3. Check user authentication
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    userId,
    session: {
      exists: !!session,
      userId: session?.user?.id,
      error: sessionError?.message
    },
    bucket: bucketVerification,
    upload: uploadTest,
    recommendations: [] as string[]
  };

  // Generate recommendations
  if (!bucketVerification.bucketExists) {
    diagnostics.recommendations.push('Create the "generated-images" storage bucket');
  }
  
  if (!bucketVerification.canUpload) {
    diagnostics.recommendations.push('Fix upload permissions for authenticated users');
  }
  
  if (!bucketVerification.canRead) {
    diagnostics.recommendations.push('Enable public read access for the bucket');
  }
  
  if (!uploadTest.success) {
    diagnostics.recommendations.push('Debug the complete upload process');
  }

  console.log('=== DIAGNOSTICS COMPLETE ===');
  console.log(JSON.stringify(diagnostics, null, 2));
  
  return diagnostics;
};