import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  RefreshCw,
  Settings,
  Upload,
  Download,
  Trash2,
  Info,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { 
  runStorageDiagnostics, 
  verifyStorageBucket, 
  createStorageBucket,
  testLogoUploadProcess,
  testDirectStorageOperations
} from '../lib/storageVerification';
import toast from 'react-hot-toast';

export const StorageDiagnostics: React.FC = () => {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  const runDiagnostics = async () => {
    if (!user) {
      toast.error('Please sign in to run diagnostics');
      return;
    }

    setIsRunning(true);
    try {
      console.log('Starting comprehensive storage diagnostics...');
      const results = await runStorageDiagnostics(user.id);
      setDiagnostics(results);
      
      const hasErrors = results.bucket.errors.length > 0 || !results.upload.success;
      
      if (!hasErrors) {
        toast.success('✅ All storage tests passed!');
      } else {
        toast.error('❌ Storage issues detected - check results below');
      }
    } catch (error: any) {
      console.error('Diagnostics failed:', error);
      toast.error(`Diagnostics failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const createBucket = async () => {
    setIsRunning(true);
    try {
      const result = await createStorageBucket();
      if (result.success) {
        toast.success('Storage bucket created/verified successfully!');
        // Re-run diagnostics
        await runDiagnostics();
      } else {
        toast.error(`Failed to create bucket: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Bucket creation failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const testUpload = async () => {
    if (!user) return;
    
    setIsRunning(true);
    try {
      const result = await testLogoUploadProcess(user.id);
      if (result.success) {
        toast.success('✅ Upload test successful!');
        console.log('Test upload URL:', result.publicUrl);
      } else {
        toast.error(`❌ Upload test failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Upload test error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const testDirectStorage = async () => {
    if (!user) return;
    
    setIsRunning(true);
    try {
      const result = await testDirectStorageOperations(user.id);
      console.log('Direct storage test results:', result);
      
      if (result.uploadFile.success) {
        toast.success('✅ Direct storage test successful!');
      } else {
        toast.error(`❌ Direct storage test failed: ${result.uploadFile.error}`);
      }
    } catch (error: any) {
      toast.error(`Direct storage test error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  if (!user) {
    return (
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
        <div className="text-center">
          <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Storage Diagnostics</h3>
          <p className="text-gray-600">Please sign in to run storage diagnostics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-200/50">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Storage Diagnostics</h3>
              <p className="text-gray-600">Test and verify storage bucket configuration</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <Settings className="h-4 w-4" />
            <span>{showDetails ? 'Hide' : 'Show'} Details</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={runDiagnostics}
            disabled={isRunning}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>Full Diagnostics</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={createBucket}
            disabled={isRunning}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Database className="h-4 w-4" />
            <span>Create Bucket</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={testUpload}
            disabled={isRunning}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            <span>Test Upload</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={testDirectStorage}
            disabled={isRunning}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            <Info className="h-4 w-4" />
            <span>Direct Test</span>
          </motion.button>
        </div>
      </div>

      {/* Results */}
      {diagnostics && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg border ${
              diagnostics.bucket.bucketExists 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {diagnostics.bucket.bucketExists ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">Bucket Exists</span>
              </div>
              {diagnostics.bucket.bucketDetails && (
                <p className="text-xs text-gray-600 mt-1">
                  Public: {diagnostics.bucket.bucketDetails.public ? 'Yes' : 'No'}
                </p>
              )}
            </div>

            <div className={`p-4 rounded-lg border ${
              diagnostics.bucket.canUpload 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {diagnostics.bucket.canUpload ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">Can Upload</span>
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${
              diagnostics.upload.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {diagnostics.upload.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">Upload Test</span>
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${
              diagnostics.directStorage.uploadFile.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {diagnostics.directStorage.uploadFile.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">Direct Upload</span>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {diagnostics.recommendations.length > 0 && (
            <div className={`border rounded-lg p-4 ${
              diagnostics.recommendations.some((rec: string) => rec.includes('❌'))
                ? 'bg-red-50 border-red-200'
                : diagnostics.recommendations.some((rec: string) => rec.includes('⚠️'))
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center space-x-2 mb-3">
                {diagnostics.recommendations.some((rec: string) => rec.includes('❌')) ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : diagnostics.recommendations.some((rec: string) => rec.includes('⚠️')) ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                <span className="font-medium text-gray-900">
                  {diagnostics.recommendations.some((rec: string) => rec.includes('❌'))
                    ? 'Issues Found'
                    : diagnostics.recommendations.some((rec: string) => rec.includes('⚠️'))
                    ? 'Warnings'
                    : 'All Tests Passed'
                  }
                </span>
              </div>
              <ul className="space-y-2">
                {diagnostics.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="text-sm text-gray-700 flex items-start space-x-2">
                    <span className="mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Test URLs */}
          {(diagnostics.bucket.testFileUrl || diagnostics.upload.publicUrl) && (
            <div className="space-y-4">
              {diagnostics.bucket.testFileUrl && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Download className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-800">Bucket Test File</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(diagnostics.bucket.testFileUrl)}
                        className="p-1 text-blue-600 hover:text-blue-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <a 
                        href={diagnostics.bucket.testFileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1 text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                  <p className="text-blue-700 text-sm font-mono break-all">
                    {diagnostics.bucket.testFileUrl}
                  </p>
                </div>
              )}

              {diagnostics.upload.publicUrl && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-800">Upload Test Result</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(diagnostics.upload.publicUrl)}
                        className="p-1 text-green-600 hover:text-green-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <a 
                        href={diagnostics.upload.publicUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1 text-green-600 hover:text-green-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                  <p className="text-green-700 text-sm mb-2">
                    <strong>Logo ID:</strong> {diagnostics.upload.logoId}
                  </p>
                  <p className="text-green-700 text-sm font-mono break-all">
                    {diagnostics.upload.publicUrl}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Details */}
          {diagnostics.bucket.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-800">Errors Detected</span>
              </div>
              <ul className="space-y-2">
                {diagnostics.bucket.errors.map((error: string, index: number) => (
                  <li key={index} className="text-red-700 text-sm flex items-start space-x-2">
                    <span className="mt-0.5">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Session Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Info className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-800">Session Information</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">User ID:</span>
                <p className="font-mono text-gray-600 break-all">{diagnostics.userId}</p>
              </div>
              <div>
                <span className="font-medium">Session:</span>
                <p className={`${diagnostics.session.exists ? 'text-green-600' : 'text-red-600'}`}>
                  {diagnostics.session.exists ? '✓ Active' : '✗ Not found'}
                </p>
              </div>
              <div>
                <span className="font-medium">Timestamp:</span>
                <p className="text-gray-600">{new Date(diagnostics.timestamp).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          {showDetails && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Detailed Results</h4>
              <div className="bg-white rounded border p-4">
                <pre className="text-xs text-gray-600 overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};