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
  Trash2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { 
  runStorageDiagnostics, 
  verifyStorageBucket, 
  createStorageBucket,
  testLogoUploadProcess 
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
      const results = await runStorageDiagnostics(user.id);
      setDiagnostics(results);
      
      if (results.bucket.errors.length === 0 && results.upload.success) {
        toast.success('All storage tests passed!');
      } else {
        toast.error('Storage issues detected - check results');
      }
    } catch (error: any) {
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
        toast.success('Storage bucket created successfully!');
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
        toast.success('Upload test successful!');
        console.log('Test upload URL:', result.publicUrl);
      } else {
        toast.error(`Upload test failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Upload test error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
          <span>Run Full Diagnostics</span>
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
      </div>

      {/* Results */}
      {diagnostics && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>

          {/* Recommendations */}
          {diagnostics.recommendations.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">Recommendations</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-yellow-700">
                {diagnostics.recommendations.map((rec: string, index: number) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Results */}
          {showDetails && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Detailed Results</h4>
              <pre className="text-xs text-gray-600 overflow-auto max-h-96">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            </div>
          )}

          {/* Test File URL */}
          {diagnostics.bucket.testFileUrl && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Download className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800">Test File URL</span>
              </div>
              <a 
                href={diagnostics.bucket.testFileUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
              >
                {diagnostics.bucket.testFileUrl}
              </a>
            </div>
          )}

          {/* Upload Test Result */}
          {diagnostics.upload.publicUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">Upload Test Result</span>
              </div>
              <p className="text-green-700 text-sm mb-2">Logo ID: {diagnostics.upload.logoId}</p>
              <a 
                href={diagnostics.upload.publicUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-800 underline text-sm break-all"
              >
                {diagnostics.upload.publicUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};