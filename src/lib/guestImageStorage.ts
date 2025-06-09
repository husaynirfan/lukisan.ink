import { set, get, keys, del } from 'idb-keyval';
import { blobToDataUrl, dataUrlToBlob } from './logoSaver';

export interface GuestImageData {
  id: string;
  blob: Blob;
  prompt: string;
  category: string;
  aspectRatio: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Saves a guest-generated image to IndexedDB
 * This replaces the old method of storing blob URLs in localStorage
 */
export const saveGuestImageLocally = async (
  imageBlob: Blob,
  prompt: string,
  category: string,
  aspectRatio: string = '1:1'
): Promise<{ success: boolean; imageId?: string; error?: string }> => {
  try {
    console.log('=== SAVING GUEST IMAGE TO INDEXEDDB ===');
    console.log('Image blob size:', imageBlob.size);
    console.log('Prompt:', prompt.substring(0, 50) + '...');
    console.log('Category:', category);
    
    // Generate a unique key for this image
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const imageId = `guest-image-${timestamp}-${randomId}`;

    console.log('Generated image ID:', imageId);

    // Create the image data object with the actual Blob
    const imageData: GuestImageData = {
      id: imageId,
      blob: imageBlob, // Store the actual Blob, not a URL
      prompt,
      category,
      aspectRatio,
      createdAt: timestamp,
      expiresAt: timestamp + (2 * 60 * 60 * 1000), // 2 hours from now
    };

    console.log('Saving to IndexedDB with key:', imageId);
    
    // Save to IndexedDB using idb-keyval
    await set(imageId, imageData);

    console.log(`✓ Successfully saved guest image to IndexedDB: ${imageId}`);
    
    // Verify the save by immediately retrieving it
    const verification = await get(imageId);
    if (verification) {
      console.log('✓ Verification successful - image exists in IndexedDB');
    } else {
      console.error('✗ Verification failed - image not found in IndexedDB');
    }
    
    return {
      success: true,
      imageId
    };

  } catch (error: any) {
    console.error('✗ Error saving guest image to IndexedDB:', error);
    return {
      success: false,
      error: error.message || 'Failed to save image locally'
    };
  }
};

/**
 * Transfers all guest images to the authenticated user's account
 * This replaces the old transferTempImagesToUser function
 */
export const transferGuestImagesToUserAccount = async (
  user: any, // Supabase user object
  imagesToTransfer: GuestImageData[], // Accept the list directly
  uploadAndSaveLogo: (blob: Blob, prompt: string, category: string, userId: string, aspectRatio?: string) => Promise<{ success: boolean; error?: string }>
): Promise<{
  success: boolean;
  transferredCount: number;
  failedCount: number;
  errors: string[];
}> => {
  const result = {
    success: false,
    transferredCount: 0,
    failedCount: 0,
    errors: [] as string[]
  };

  try {
    console.log(`=== TRANSFER GUEST IMAGES TO USER ACCOUNT ===`);
    console.log(`User ID: ${user.id}`);
    console.log(`Images to transfer: ${imagesToTransfer.length}`);

    if (imagesToTransfer.length === 0) {
      console.log('No guest images provided to transfer.');
      result.success = true;
      return result;
    }

    // Process each guest image from the provided list
    for (let i = 0; i < imagesToTransfer.length; i++) {
      const imageData = imagesToTransfer[i];
      const imageKey = imageData.id;
      
      try {
        console.log(`Processing image ${i + 1}/${imagesToTransfer.length}: ${imageKey}`);
        console.log(`  Prompt: ${imageData.prompt.substring(0, 50)}...`);
        console.log(`  Category: ${imageData.category}`);
        console.log(`  Blob size: ${imageData.blob.size} bytes`);

        // Check if the image has expired (optional but good practice)
        if (Date.now() > imageData.expiresAt) {
          console.log(`Image ${imageKey} has expired, skipping transfer`);
          await del(imageKey); // Clean up expired image
          result.failedCount++;
          result.errors.push(`Image ${imageKey} has expired`);
          continue;
        }

        console.log(`Uploading logo to user account: ${imageData.prompt.substring(0, 50)}...`);
        const uploadResult = await uploadAndSaveLogo(
          imageData.blob,
          imageData.prompt,
          imageData.category,
          user.id,
          imageData.aspectRatio
        );

        if (uploadResult.success) {
          console.log(`✓ Successfully transferred image: ${imageKey}`);
          result.transferredCount++;
          
          // Delete the image from IndexedDB after successful transfer
          await del(imageKey);
          console.log(`✓ Cleaned up IndexedDB entry: ${imageKey}`);
        } else {
          console.error(`✗ Failed to upload image ${imageKey}:`, uploadResult.error);
          result.failedCount++;
          result.errors.push(`Upload failed for ${imageKey}: ${uploadResult.error}`);
        }

      } catch (error: any) {
        console.error(`✗ Error processing image ${imageKey}:`, error);
        result.failedCount++;
        result.errors.push(`Processing error for ${imageKey}: ${error.message}`);
      }
    }

    result.success = result.transferredCount > 0 || result.failedCount === 0;
    
    console.log(`=== TRANSFER COMPLETED ===`);
    console.log(`✓ Successful transfers: ${result.transferredCount}`);
    console.log(`✗ Failed transfers: ${result.failedCount}`);
    console.log(`Errors: ${result.errors.length}`);
    
    return result;

  } catch (error: any) {
    console.error('=== TRANSFER PROCESS ERROR ===');
    console.error('Error in transferGuestImagesToUserAccount:', error);
    result.errors.push(`Transfer process error: ${error.message}`);
    return result;
  }
};

/**
 * Gets all guest images for preview/display purposes
 */
export const getGuestImages = async (): Promise<GuestImageData[]> => {
  try {
    console.log('=== GETTING GUEST IMAGES FROM INDEXEDDB ===');
    
    const allKeys = await keys();
    console.log('Total keys in IndexedDB:', allKeys.length);
    
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    console.log(`Found ${guestImageKeys.length} guest image keys in IndexedDB:`, guestImageKeys);

    const images: GuestImageData[] = [];
    const now = Date.now();

    for (const key of guestImageKeys) {
      try {
        console.log(`Retrieving image data for key: ${key}`);
        const imageData: GuestImageData | undefined = await get(key);
        
        if (imageData) {
          console.log(`  ✓ Found image: ${imageData.prompt.substring(0, 30)}...`);
          console.log(`  ✓ Blob size: ${imageData.blob.size} bytes`);
          console.log(`  ✓ Created: ${new Date(imageData.createdAt).toLocaleString()}`);
          console.log(`  ✓ Expires: ${new Date(imageData.expiresAt).toLocaleString()}`);
          
          // Check if expired
          if (now > imageData.expiresAt) {
            console.log(`  ✗ Image expired, deleting: ${key}`);
            // Delete expired image
            await del(key);
          } else {
            console.log(`  ✓ Image valid, adding to results`);
            images.push(imageData);
          }
        } else {
          console.log(`  ✗ No data found for key: ${key}`);
        }
      } catch (error) {
        console.error(`Error retrieving guest image ${key}:`, error);
      }
    }

    console.log(`Returning ${images.length} valid guest images`);
    return images;
  } catch (error) {
    console.error('Error getting guest images:', error);
    return [];
  }
};

/**
 * Creates a display URL for a guest image
 */
export const createGuestImageDisplayUrl = (imageData: GuestImageData): string => {
  return URL.createObjectURL(imageData.blob);
};

/**
 * Cleans up all guest images (call on sign out or cleanup)
 */
export const cleanupAllGuestImages = async (): Promise<void> => {
  try {
    console.log('=== CLEANING UP ALL GUEST IMAGES ===');
    
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    console.log(`Found ${guestImageKeys.length} guest images to clean up`);

    for (const key of guestImageKeys) {
      await del(key);
      console.log(`Deleted: ${key}`);
    }

    console.log(`✓ Cleaned up ${guestImageKeys.length} guest images from IndexedDB`);
  } catch (error) {
    console.error('Error cleaning up guest images:', error);
  }
};

/**
 * Cleans up expired guest images only
 */
export const cleanupExpiredGuestImages = async (): Promise<void> => {
  try {
    console.log('=== CLEANING UP EXPIRED GUEST IMAGES ===');
    
    const allKeys = await keys();
    const guestImageKeys = allKeys.filter(key => 
      typeof key === 'string' && key.startsWith('guest-image-')
    ) as string[];

    const now = Date.now();
    let cleanedCount = 0;

    for (const key of guestImageKeys) {
      try {
        const imageData: GuestImageData | undefined = await get(key);
        
        if (imageData && now > imageData.expiresAt) {
          await del(key);
          cleanedCount++;
          console.log(`Cleaned up expired image: ${key}`);
        }
      } catch (error) {
        console.error(`Error checking expiration for ${key}:`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`✓ Cleaned up ${cleanedCount} expired guest images`);
    } else {
      console.log('No expired guest images found');
    }
  } catch (error) {
    console.error('Error cleaning up expired guest images:', error);
  }
};