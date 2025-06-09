import { supabase } from './supabase';
import { handleSaveGeneratedLogo } from './logoSaver';
import { 
  saveGuestImageLocally, 
  transferGuestImagesToUserAccount,
  getGuestImages,
  createGuestImageDisplayUrl,
  cleanupAllGuestImages,
  cleanupExpiredGuestImages,
  GuestImageData
} from './guestImageStorage';

export interface GuestSession {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

export interface TempImage {
  id: string;
  sessionId: string;
  imageUrl: string;
  prompt: string;
  category: string;
  aspectRatio: string;
  createdAt: number;
  expiresAt: number;
  transferred?: boolean;
}

export interface TransferResult {
  success: boolean;
  transferredCount: number;
  failedCount: number;
  insufficientCredits: boolean;
  creditsNeeded: number;
  creditsAvailable: number;
  errors: string[];
}

// Session management
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Creates or retrieves a guest session identifier
 */
export const getOrCreateGuestSession = (): GuestSession => {
  const existingSession = localStorage.getItem('guest_session');
  
  if (existingSession) {
    try {
      const session: GuestSession = JSON.parse(existingSession);
      
      // Check if session is still valid
      if (Date.now() < session.expiresAt) {
        return session;
      }
    } catch (error) {
      console.warn('Invalid guest session data, creating new session');
    }
  }
  
  // Create new session
  const newSession: GuestSession = {
    sessionId: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  };
  
  localStorage.setItem('guest_session', JSON.stringify(newSession));
  console.log('Created new guest session:', newSession.sessionId);
  
  return newSession;
};

/**
 * Stores a temporary image for guest users using IndexedDB
 */
export const storeTempImage = async (params: {
  imageUrl: string;
  prompt: string;
  category: string;
  aspectRatio: string;
}): Promise<{ success: boolean; tempImage?: TempImage; error?: string }> => {
  try {
    console.log('=== STORE TEMP IMAGE ===');
    console.log('Image URL:', params.imageUrl);
    console.log('Prompt:', params.prompt.substring(0, 50) + '...');
    
    const guestSession = getOrCreateGuestSession();
    console.log('Guest session ID:', guestSession.sessionId);
    
    console.log('Converting image URL to blob for storage...');
    
    // Convert the image URL to a Blob
    const response = await fetch(params.imageUrl, {
      mode: 'cors',
      headers: { 'Accept': 'image/*' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const imageBlob = await response.blob();
    console.log('Successfully converted URL to blob, size:', imageBlob.size);

    // Save the blob to IndexedDB using our new function
    const saveResult = await saveGuestImageLocally(
      imageBlob,
      params.prompt,
      params.category,
      params.aspectRatio
    );

    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save image locally');
    }

    // Create a temporary image object for compatibility
    const tempImage: TempImage = {
      id: saveResult.imageId!,
      sessionId: guestSession.sessionId,
      imageUrl: params.imageUrl,
      prompt: params.prompt,
      category: params.category,
      aspectRatio: params.aspectRatio || '1:1',
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION,
      transferred: false
    };
    
    console.log('Successfully stored guest image:', saveResult.imageId);
    console.log('Temp image object created:', tempImage);
    
    return { success: true, tempImage };
  } catch (error: any) {
    console.error('Error storing temporary image:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves temporary images for display (now from IndexedDB)
 */
export const getTempImages = async (sessionId?: string): Promise<TempImage[]> => {
  try {
    console.log('=== GET TEMP IMAGES ===');
    
    const guestImages = await getGuestImages();
    console.log('getTempImages - found guest images:', guestImages.length);
    
    // Convert GuestImageData to TempImage format for compatibility
    const tempImages = guestImages.map(imageData => ({
      id: imageData.id,
      sessionId: sessionId || 'current',
      imageUrl: createGuestImageDisplayUrl(imageData), // Create blob URL for display
      prompt: imageData.prompt,
      category: imageData.category,
      aspectRatio: imageData.aspectRatio,
      createdAt: imageData.createdAt,
      expiresAt: imageData.expiresAt,
      transferred: false
    }));
    
    console.log('getTempImages - converted to temp images:', tempImages.length);
    return tempImages;
  } catch (error) {
    console.error('Error retrieving temporary images:', error);
    return [];
  }
};

/**
 * Checks user's available credits for image transfer
 */
export const checkUserCredits = async (userId: string): Promise<{
  available: number;
  isProUser: boolean;
  canGenerate: boolean;
}> => {
  try {
    console.log('=== CHECKING USER CREDITS ===');
    console.log('User ID:', userId);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('tier, credits_remaining, daily_generations, last_generation_date')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user credits:', error);
      throw new Error(`Failed to fetch user credits: ${error.message}`);
    }

    console.log('User data:', user);

    const isProUser = user.tier === 'pro';
    
    if (isProUser) {
      const result = {
        available: user.credits_remaining,
        isProUser: true,
        canGenerate: user.credits_remaining > 0
      };
      console.log('Pro user credits:', result);
      return result;
    } else {
      // Free user logic
      const today = new Date().toISOString().split('T')[0];
      const lastGenDate = user.last_generation_date?.split('T')[0];
      
      const dailyUsed = lastGenDate === today ? user.daily_generations : 0;
      const available = Math.max(0, 3 - dailyUsed);
      
      const result = {
        available,
        isProUser: false,
        canGenerate: available > 0
      };
      console.log('Free user credits:', result);
      return result;
    }
  } catch (error: any) {
    console.error('Error checking user credits:', error);
    return {
      available: 0,
      isProUser: false,
      canGenerate: false
    };
  }
};

/**
 * Transfers temporary images to user's permanent library using the new IndexedDB approach
 */
export const transferTempImagesToUser = async (userId: string): Promise<TransferResult> => {
  console.log('=== STARTING TRANSFER PROCESS ===');
  console.log('transferTempImagesToUser - userId:', userId);
  
  const result: TransferResult = {
    success: false,
    transferredCount: 0,
    failedCount: 0,
    insufficientCredits: false,
    creditsNeeded: 0,
    creditsAvailable: 0,
    errors: []
  };

  try {
    console.log('Step 1: Getting guest images from IndexedDB');
    
    // Get all guest images from IndexedDB (not filtered by session)
    const allGuestImages = await getGuestImages();
    console.log(`Found ${allGuestImages.length} total guest images in IndexedDB`);
    
    // Filter out any images that might have been transferred already
    // (though this shouldn't happen in normal flow)
    const untransferredImages = allGuestImages.filter(img => {
      // We don't have a transferred flag in GuestImageData, so we'll transfer all
      return true;
    });
    
    console.log(`Found ${untransferredImages.length} untransferred guest images`);
    
    if (untransferredImages.length === 0) {
      console.log('No guest images to transfer');
      result.success = true;
      return result;
    }

    console.log('Step 2: Checking user credits');
    // Check user credits
    const creditInfo = await checkUserCredits(userId);
    console.log('transferTempImagesToUser - creditInfo:', creditInfo);
    result.creditsAvailable = creditInfo.available;
    result.creditsNeeded = untransferredImages.length;
    
    if (!creditInfo.canGenerate || creditInfo.available < untransferredImages.length) {
      console.log('Insufficient credits for transfer');
      result.insufficientCredits = true;
      result.errors.push(`Insufficient credits. Need ${untransferredImages.length}, have ${creditInfo.available}`);
      return result;
    }

    console.log('Step 3: Verifying user session');
    // Get fresh session to ensure valid auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('Error getting user session:', sessionError);
      result.errors.push('Authentication error. Please sign in again.');
      return result;
    }

    console.log('Step 4: Setting up upload function');
    // Upload and save function
    const uploadAndSaveLogo = async (
      blob: Blob, 
      prompt: string, 
      category: string, 
      userId: string, 
      aspectRatio?: string
    ) => {
      try {
        console.log(`Uploading logo: ${prompt.substring(0, 50)}...`);
        
        const fileName = `logo-${Date.now()}.png`;
        const filePath = `logos/${userId}/${fileName}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('generated-images') 
          .upload(filePath, blob, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'image/png'
          });

        if (uploadError) {
          console.error('Error uploading logo:', uploadError);
          return { success: false, error: uploadError.message };
        }

        // Get public URL from the correct bucket
        const { data: { publicUrl } } = supabase.storage
          .from('generated-images')
          .getPublicUrl(filePath);

        // Save to database
        const { error: dbError } = await supabase
          .from('logo_generations') 
          .insert([{
            user_id: userId,
            prompt,
            category,
            image_url: publicUrl,
            aspect_ratio: aspectRatio || '1:1'
          }]);

        if (dbError) {
          console.error('Error saving logo to database:', dbError);
          return { success: false, error: dbError.message };
        }

        console.log('Successfully uploaded and saved logo');
        return { success: true };
      } catch (error: any) {
        console.error('Error in uploadAndSaveLogo:', error);
        return { success: false, error: error.message };
      }
    };

    console.log('Step 5: Starting transfer process');
    // Transfer the images using the enhanced function
    const transferResult = await transferGuestImagesToUserAccount(
      { id: userId },
      untransferredImages,
      uploadAndSaveLogo
    );
    
    console.log('Step 6: Processing transfer results');
    // Update result with transfer results
    result.success = transferResult.success;
    result.transferredCount = transferResult.transferredCount;
    result.failedCount = transferResult.failedCount;
    result.errors = transferResult.errors;

    console.log('Step 7: Updating user credits');
    // Update user credits if any images were transferred
    if (result.transferredCount > 0) {
      await deductUserCredits(userId, result.transferredCount, creditInfo.isProUser);
      console.log(`Deducted ${result.transferredCount} credits from user ${userId}`);
    }

    console.log(`=== TRANSFER COMPLETED ===`);
    console.log(`Transferred: ${result.transferredCount}, Failed: ${result.failedCount}`);
    return result;

  } catch (error: any) {
    console.error('=== TRANSFER ERROR ===');
    console.error('Error in transferTempImagesToUser:', error);
    result.errors.push(`Transfer error: ${error.message}`);
    return result;
  }
};

/**
 * Deducts credits from user account
 */
const deductUserCredits = async (userId: string, count: number, isProUser: boolean): Promise<void> => {
  try {
    console.log('=== DEDUCTING USER CREDITS ===');
    console.log('User ID:', userId);
    console.log('Credits to deduct:', count);
    console.log('Is pro user:', isProUser);
    
    if (isProUser) {
      // Deduct from credits_remaining
      const { error } = await supabase
        .from('users')
        .update({
          credits_remaining: supabase.sql`credits_remaining - ${count}`,
          last_generation_date: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        throw new Error(`Failed to deduct pro credits: ${error.message}`);
      }
      console.log(`✓ Deducted ${count} pro credits`);
    } else {
      // Update daily generations
      const today = new Date().toISOString();
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('daily_generations, last_generation_date')
        .eq('id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch user data: ${fetchError.message}`);
      }

      const todayDate = today.split('T')[0];
      const lastGenDate = user.last_generation_date?.split('T')[0];
      
      const newDailyCount = lastGenDate === todayDate 
        ? user.daily_generations + count 
        : count;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          daily_generations: newDailyCount,
          last_generation_date: today
        })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to update daily generations: ${updateError.message}`);
      }
      console.log(`✓ Updated daily generations: ${newDailyCount}`);
    }

    console.log(`Successfully deducted ${count} credits for user ${userId}`);
  } catch (error) {
    console.error('Error deducting user credits:', error);
    throw error;
  }
};

/**
 * Cleans up expired temporary images
 */
export const cleanupExpiredTempImages = async (): Promise<void> => {
  try {
    await cleanupExpiredGuestImages();
    console.log('Cleanup of expired guest images completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

/**
 * Clears all temporary data for a session
 */
export const clearGuestSession = async (sessionId?: string): Promise<void> => {
  try {
    // Clean up IndexedDB
    await cleanupAllGuestImages();
    
    // Clean up localStorage
    localStorage.removeItem('guest_session');
    
    console.log('Cleared all guest session data');
  } catch (error) {
    console.error('Error clearing guest session:', error);
  }
};

/**
 * Gets current session info for debugging
 */
export const getSessionInfo = async (): Promise<{
  session: GuestSession | null;
  tempImageCount: number;
  isExpired: boolean;
}> => {
  try {
    const sessionData = localStorage.getItem('guest_session');
    if (!sessionData) {
      return { session: null, tempImageCount: 0, isExpired: false };
    }

    const session: GuestSession = JSON.parse(sessionData);
    const guestImages = await getGuestImages();
    const isExpired = Date.now() > session.expiresAt;

    return {
      session,
      tempImageCount: guestImages.length,
      isExpired
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return { session: null, tempImageCount: 0, isExpired: true };
  }
};

// Export the new functions for external use
export { 
  saveGuestImageLocally, 
  transferGuestImagesToUserAccount,
  getGuestImages,
  createGuestImageDisplayUrl,
  cleanupAllGuestImages,
  cleanupExpiredGuestImages,
  type GuestImageData
};