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
  bucketDetails?: any;
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

    // Step 1: Check if bucket exists using a different approach
    console.log('Step 1: Checking if bucket exists...');
    
    // Try to list buckets first
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.log('Bucket listing failed, trying alternative method...');
      // If listing fails, try to access the bucket directly
      const { data: testList, error: testListError } = await supabase.storage
        .from('generated-images')
        .list('', { limit: 1 });
      
      if (!testListError) {
        result.bucketExists = true;
        result.bucketPublic = true; // Assume public if we can list
        console.log('✓ Bucket exists (verified via direct access)');
      } else {
        result.errors.push(`Cannot access bucket: ${testListError.message}`);
        console.error('✗ Bucket access failed:', testListError);
      }
    } else {
      const generatedImagesBucket = buckets?.find(bucket => bucket.id === 'generated-images');
      if (generatedImagesBucket) {
        result.bucketExists = true;
        result.bucketPublic = generatedImagesBucket.public;
        result.bucketDetails = generatedImagesBucket;
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
      
      // Try to understand why upload failed
      if (uploadError.message.includes('Bucket not found')) {
        result.errors.push('Bucket "generated-images" does not exist - needs to be created');
      } else if (uploadError.message.includes('not allowed')) {
        result.errors.push('Upload permission denied - check RLS policies');
      }
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

    // Step 7: Check authentication
    console.log('Step 7: Checking authentication...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      result.errors.push('User not authenticated');
      console.error('✗ Authentication issue:', sessionError);
    } else {
      console.log('✓ User authenticated:', session.user.id);
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

    // First check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (!listError && buckets) {
      const existingBucket = buckets.find(bucket => bucket.id === 'generated-images');
      if (existingBucket) {
        console.log('✓ Bucket already exists:', existingBucket);
        return { success: true };
      }
    }

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
  details?: any;
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

      // Test if the uploaded file is accessible
      if (saveResult.publicUrl) {
        try {
          const response = await fetch(saveResult.publicUrl);
          if (response.ok) {
            console.log('✓ Uploaded file is accessible via public URL');
          } else {
            console.warn('⚠ Uploaded file not accessible:', response.status);
          }
        } catch (fetchError) {
          console.warn('⚠ Could not verify file accessibility:', fetchError);
        }
      }

      return {
        success: true,
        logoId: saveResult.logoId,
        publicUrl: saveResult.publicUrl,
        details: saveResult
      };
    } else {
      console.error('✗ Upload process failed:', saveResult.error);
      return {
        success: false,
        error: saveResult.error,
        details: saveResult
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
 * Test direct storage operations
 */
export const testDirectStorageOperations = async (userId: string) => {
  console.log('=== TESTING DIRECT STORAGE OPERATIONS ===');
  
  const results = {
    listBuckets: { success: false, error: '', data: null as any },
    uploadFile: { success: false, error: '', data: null as any },
    getPublicUrl: { success: false, error: '', data: null as any },
    downloadFile: { success: false, error: '', data: null as any },
    deleteFile: { success: false, error: '', data: null as any }
  };

  // Test 1: List buckets
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      results.listBuckets.error = error.message;
    } else {
      results.listBuckets.success = true;
      results.listBuckets.data = data;
    }
  } catch (error: any) {
    results.listBuckets.error = error.message;
  }

  // Test 2: Upload file
  const testPath = `logos/${userId}/direct-test-${Date.now()}.txt`;
  const testContent = new Blob(['Direct storage test'], { type: 'text/plain' });
  
  try {
    const { data, error } = await supabase.storage
      .from('generated-images')
      .upload(testPath, testContent);
    
    if (error) {
      results.uploadFile.error = error.message;
    } else {
      results.uploadFile.success = true;
      results.uploadFile.data = data;
    }
  } catch (error: any) {
    results.uploadFile.error = error.message;
  }

  // Test 3: Get public URL (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      const { data } = supabase.storage
        .from('generated-images')
        .getPublicUrl(testPath);
      
      results.getPublicUrl.success = true;
      results.getPublicUrl.data = data;
    } catch (error: any) {
      results.getPublicUrl.error = error.message;
    }
  }

  // Test 4: Download file (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      const { data, error } = await supabase.storage
        .from('generated-images')
        .download(testPath);
      
      if (error) {
        results.downloadFile.error = error.message;
      } else {
        results.downloadFile.success = true;
        results.downloadFile.data = { size: data?.size };
      }
    } catch (error: any) {
      results.downloadFile.error = error.message;
    }
  }

  // Test 5: Delete file (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      const { error } = await supabase.storage
        .from('generated-images')
        .remove([testPath]);
      
      if (error) {
        results.deleteFile.error = error.message;
      } else {
        results.deleteFile.success = true;
      }
    } catch (error: any) {
      results.deleteFile.error = error.message;
    }
  }

  console.log('Direct storage test results:', results);
  return results;
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
  
  // 3. Test direct storage operations
  const directStorageTest = await testDirectStorageOperations(userId);
  
  // 4. Check user authentication
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
    directStorage: directStorageTest,
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

  if (!directStorageTest.uploadFile.success) {
    diagnostics.recommendations.push('Fix direct storage upload issues');
  }

  console.log('=== DIAGNOSTICS COMPLETE ===');
  console.log(JSON.stringify(diagnostics, null, 2));
  
  return diagnostics;
};