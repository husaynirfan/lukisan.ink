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

    // Step 1: Check if bucket exists using the most reliable method
    console.log('Step 1: Checking if bucket exists...');
    
    // Try the most direct approach - attempt to list files in the bucket
    const { data: testList, error: testListError } = await supabase.storage
      .from('generated-images')
      .list('', { limit: 1 });
    
    if (!testListError) {
      result.bucketExists = true;
      result.bucketPublic = true; // If we can list, it exists
      console.log('✓ Bucket exists and is accessible (verified via list operation)');
    } else {
      console.log('List operation failed, trying bucket listing...');
      
      // Fallback: Try to list all buckets
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (!bucketsError && buckets) {
        const generatedImagesBucket = buckets.find(bucket => bucket.id === 'generated-images');
        if (generatedImagesBucket) {
          result.bucketExists = true;
          result.bucketPublic = generatedImagesBucket.public;
          result.bucketDetails = generatedImagesBucket;
          console.log('✓ Bucket found in bucket list:', generatedImagesBucket);
        } else {
          result.errors.push('Bucket "generated-images" not found in bucket list');
          console.error('✗ Bucket not found. Available buckets:', buckets.map(b => b.id));
        }
      } else {
        result.errors.push(`Cannot access storage: ${bucketsError?.message || testListError.message}`);
        console.error('✗ Cannot access storage at all:', { bucketsError, testListError });
      }
    }

    // Step 2: Test upload permission (most important test)
    console.log('Step 2: Testing upload permission...');
    const testPath = `logos/${userId}/verification-test-${Date.now()}.txt`;
    const testContent = new Blob(['Storage verification test'], { type: 'text/plain' });
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(testPath, testContent, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      result.errors.push(`Upload test failed: ${uploadError.message}`);
      console.error('✗ Upload test failed:', uploadError);
      
      // Analyze the error
      if (uploadError.message.includes('Bucket not found')) {
        result.errors.push('CRITICAL: Bucket "generated-images" does not exist');
      } else if (uploadError.message.includes('not allowed') || uploadError.message.includes('permission')) {
        result.errors.push('Upload permission denied - check RLS policies');
      } else if (uploadError.message.includes('authenticated')) {
        result.errors.push('Authentication required for upload');
      }
    } else {
      result.canUpload = true;
      result.permissions.upload = true;
      console.log('✓ Upload test successful:', uploadData);

      // Step 3: Test public URL generation
      console.log('Step 3: Testing public URL generation...');
      const { data: publicUrlData } = supabase.storage
        .from('generated-images')
        .getPublicUrl(testPath);

      if (publicUrlData.publicUrl) {
        result.testFileUrl = publicUrlData.publicUrl;
        console.log('✓ Public URL generated:', publicUrlData.publicUrl);

        // Step 4: Test if the URL is actually accessible
        console.log('Step 4: Testing public URL accessibility...');
        try {
          const response = await fetch(publicUrlData.publicUrl);
          if (response.ok) {
            result.canRead = true;
            result.permissions.read = true;
            console.log('✓ File is publicly accessible');
          } else {
            result.errors.push(`File not accessible via public URL: ${response.status} ${response.statusText}`);
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

    // Step 6: Check authentication status
    console.log('Step 6: Checking authentication...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      result.errors.push('User not authenticated - this may affect upload permissions');
      console.error('✗ Authentication issue:', sessionError);
    } else {
      console.log('✓ User authenticated:', session.user.id);
    }

    // Step 7: Test user directory access
    console.log('Step 7: Testing user directory access...');
    const userDir = `logos/${userId}`;
    const { data: files, error: listError } = await supabase.storage
      .from('generated-images')
      .list(userDir);

    if (listError) {
      result.errors.push(`Cannot list user directory: ${listError.message}`);
      console.error('✗ List user directory failed:', listError);
    } else {
      console.log('✓ User directory accessible:', files?.length || 0, 'files found');
    }

  } catch (error: any) {
    result.errors.push(`Verification failed: ${error.message}`);
    console.error('=== STORAGE VERIFICATION ERROR ===', error);
  }

  console.log('=== STORAGE VERIFICATION COMPLETE ===');
  console.log('Bucket exists:', result.bucketExists);
  console.log('Can upload:', result.canUpload);
  console.log('Can read:', result.canRead);
  console.log('Errors:', result.errors);
  
  return result;
};

/**
 * Creates the storage bucket if it doesn't exist
 */
export const createStorageBucket = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('=== CREATING STORAGE BUCKET ===');

    // First check if bucket already exists using the most reliable method
    const { data: testList, error: testListError } = await supabase.storage
      .from('generated-images')
      .list('', { limit: 1 });
    
    if (!testListError) {
      console.log('✓ Bucket already exists and is accessible');
      return { success: true };
    }

    console.log('Bucket not accessible, attempting to create...');

    const { data, error } = await supabase.storage.createBucket('generated-images', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 52428800 // 50MB
    });

    if (error) {
      console.error('✗ Failed to create bucket:', error);
      
      // Check if bucket already exists error
      if (error.message.includes('already exists')) {
        console.log('✓ Bucket already exists (creation returned "already exists" error)');
        return { success: true };
      }
      
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
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Draw a more detailed test image
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TEST', 100, 90);
    ctx.fillText('LOGO', 100, 120);
    ctx.font = '12px Arial';
    ctx.fillText(new Date().toLocaleTimeString(), 100, 150);

    // Convert to blob
    const testBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });

    console.log('Test blob created, size:', testBlob.size, 'bytes');

    // Import the handleSaveGeneratedLogo function
    const { handleSaveGeneratedLogo } = await import('./logoSaver');

    // Test the complete save process
    const saveResult = await handleSaveGeneratedLogo({
      imageBlob: testBlob,
      prompt: 'Storage verification test logo',
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
            console.log('✓ Response status:', response.status);
            console.log('✓ Content type:', response.headers.get('content-type'));
          } else {
            console.warn('⚠ Uploaded file not accessible:', response.status, response.statusText);
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
    console.log('Testing bucket listing...');
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      results.listBuckets.error = error.message;
      console.error('✗ List buckets failed:', error);
    } else {
      results.listBuckets.success = true;
      results.listBuckets.data = data;
      console.log('✓ List buckets successful:', data?.map(b => b.id));
    }
  } catch (error: any) {
    results.listBuckets.error = error.message;
    console.error('✗ List buckets exception:', error);
  }

  // Test 2: Upload file
  const testPath = `logos/${userId}/direct-test-${Date.now()}.txt`;
  const testContent = new Blob(['Direct storage test file content'], { type: 'text/plain' });
  
  try {
    console.log('Testing file upload to path:', testPath);
    const { data, error } = await supabase.storage
      .from('generated-images')
      .upload(testPath, testContent, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      results.uploadFile.error = error.message;
      console.error('✗ Upload failed:', error);
    } else {
      results.uploadFile.success = true;
      results.uploadFile.data = data;
      console.log('✓ Upload successful:', data);
    }
  } catch (error: any) {
    results.uploadFile.error = error.message;
    console.error('✗ Upload exception:', error);
  }

  // Test 3: Get public URL (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      console.log('Testing public URL generation...');
      const { data } = supabase.storage
        .from('generated-images')
        .getPublicUrl(testPath);
      
      results.getPublicUrl.success = true;
      results.getPublicUrl.data = data;
      console.log('✓ Public URL generated:', data.publicUrl);
    } catch (error: any) {
      results.getPublicUrl.error = error.message;
      console.error('✗ Public URL exception:', error);
    }
  }

  // Test 4: Download file (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      console.log('Testing file download...');
      const { data, error } = await supabase.storage
        .from('generated-images')
        .download(testPath);
      
      if (error) {
        results.downloadFile.error = error.message;
        console.error('✗ Download failed:', error);
      } else {
        results.downloadFile.success = true;
        results.downloadFile.data = { size: data?.size };
        console.log('✓ Download successful, size:', data?.size);
      }
    } catch (error: any) {
      results.downloadFile.error = error.message;
      console.error('✗ Download exception:', error);
    }
  }

  // Test 5: Delete file (only if upload succeeded)
  if (results.uploadFile.success) {
    try {
      console.log('Testing file deletion...');
      const { error } = await supabase.storage
        .from('generated-images')
        .remove([testPath]);
      
      if (error) {
        results.deleteFile.error = error.message;
        console.error('✗ Delete failed:', error);
      } else {
        results.deleteFile.success = true;
        console.log('✓ Delete successful');
      }
    } catch (error: any) {
      results.deleteFile.error = error.message;
      console.error('✗ Delete exception:', error);
    }
  }

  console.log('=== DIRECT STORAGE TEST RESULTS ===');
  console.log('List buckets:', results.listBuckets.success ? '✓' : '✗', results.listBuckets.error);
  console.log('Upload file:', results.uploadFile.success ? '✓' : '✗', results.uploadFile.error);
  console.log('Get public URL:', results.getPublicUrl.success ? '✓' : '✗', results.getPublicUrl.error);
  console.log('Download file:', results.downloadFile.success ? '✓' : '✗', results.downloadFile.error);
  console.log('Delete file:', results.deleteFile.success ? '✓' : '✗', results.deleteFile.error);
  
  return results;
};

/**
 * Comprehensive storage diagnostics
 */
export const runStorageDiagnostics = async (userId: string) => {
  console.log('=== RUNNING COMPREHENSIVE STORAGE DIAGNOSTICS ===');
  console.log('User ID:', userId);
  console.log('Timestamp:', new Date().toISOString());
  
  // 1. Check user authentication first
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  console.log('Authentication check:', {
    hasSession: !!session,
    userId: session?.user?.id,
    error: sessionError?.message
  });
  
  // 2. Verify bucket configuration
  console.log('\n--- BUCKET VERIFICATION ---');
  const bucketVerification = await verifyStorageBucket(userId);
  
  // 3. Test complete upload process
  console.log('\n--- UPLOAD PROCESS TEST ---');
  const uploadTest = await testLogoUploadProcess(userId);
  
  // 4. Test direct storage operations
  console.log('\n--- DIRECT STORAGE TEST ---');
  const directStorageTest = await testDirectStorageOperations(userId);
  
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

  // Generate recommendations based on results
  console.log('\n--- GENERATING RECOMMENDATIONS ---');
  
  if (!bucketVerification.bucketExists) {
    diagnostics.recommendations.push('❌ Create the "generated-images" storage bucket');
  } else {
    console.log('✓ Bucket exists');
  }
  
  if (!bucketVerification.canUpload) {
    diagnostics.recommendations.push('❌ Fix upload permissions - check RLS policies for authenticated users');
  } else {
    console.log('✓ Upload permissions working');
  }
  
  if (!bucketVerification.canRead) {
    diagnostics.recommendations.push('❌ Enable public read access for the bucket');
  } else {
    console.log('✓ Public read access working');
  }
  
  if (!uploadTest.success) {
    diagnostics.recommendations.push('❌ Debug the complete upload process - check handleSaveGeneratedLogo function');
  } else {
    console.log('✓ Complete upload process working');
  }

  if (!directStorageTest.uploadFile.success) {
    diagnostics.recommendations.push('❌ Fix direct storage upload issues');
  } else {
    console.log('✓ Direct storage operations working');
  }

  if (!session) {
    diagnostics.recommendations.push('⚠️ User authentication required for upload operations');
  }

  if (diagnostics.recommendations.length === 0) {
    diagnostics.recommendations.push('✅ All storage tests passed! System is working correctly.');
  }

  console.log('\n=== DIAGNOSTICS COMPLETE ===');
  console.log('Total recommendations:', diagnostics.recommendations.length);
  diagnostics.recommendations.forEach(rec => console.log(rec));
  
  return diagnostics;
};