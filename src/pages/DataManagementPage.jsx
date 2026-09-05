import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X, ChevronRight, Database, ArrowRight, Sparkles, RefreshCw, Table } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Select from '../components/ui/Select';
import ModelArchitecture from '../components/ModelArchitecture';
import { datasetService } from '../services/api';
import { useApp } from '../context/AppContext';
import { formatNumber } from '../utils/helpers';

const steps = ['Upload', 'Validate', 'Map Columns', 'Process', 'Predict', 'Analyze', 'Dashboard'];

export default function DataManagementPage() {
  const { addToast } = useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [mappings, setMappings] = useState({});
  const [predicting, setPredicting] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleUpload = async (fileToUpload = file) => {
    if (!fileToUpload) return;
    setUploading(true);
    try {
      const data = await datasetService.uploadDataset(fileToUpload, setUploadProgress);
      setDataset(data);
      setCurrentStep(1);
      addToast({ type: 'success', message: 'Dataset uploaded successfully' });
    } catch (e) {
      addToast({ type: 'error', message: 'Upload failed' });
    }
    setUploading(false);
  };

  const handleUseDemoDataset = () => {
    const demoFile = new File(
      ['customerID,tenure,MonthlyCharges,TotalCharges,Contract,Churn\n'],
      'telco_customer_churn_demo.csv',
      { type: 'text/csv' }
    );
    setFile(demoFile);
    handleUpload(demoFile);
  };

  const handleValidate = async () => {
    if (!dataset) return;
    setValidating(true);
    try {
      const data = await datasetService.validateDataset(dataset.id);
      setValidation(data);
      setCurrentStep(2);
      addToast({ type: 'success', message: 'Validation complete' });
    } catch (e) {
      addToast({ type: 'error', message: 'Validation failed' });
    }
    setValidating(false);
  };

  const handleMapColumns = async () => {
    setCurrentStep(3);
    addToast({ type: 'success', message: 'Column mapping saved' });
    setTimeout(() => setCurrentStep(4), 1000);
  };

  const handlePredict = async () => {
    setPredicting(true);
    try {
      await datasetService.runPrediction(dataset?.id);
      setCurrentStep(5);
      addToast({ type: 'success', message: 'Predictions generated' });
    } catch (e) {
      addToast({ type: 'error', message: 'Prediction failed' });
    }
    setPredicting(false);
  };

  const defaultMappings = [
    { source: 'customerID', target: 'customer_id' },
    { source: 'MonthlyCharges', target: 'monthly_charges' },
    { source: 'tenure', target: 'tenure' },
    { source: 'Contract', target: 'contract_type' },
    { source: 'TotalCharges', target: 'total_charges' },
    { source: 'Churn', target: 'churn' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Data Management</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Upload, validate, and process your customer dataset for churn prediction.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < currentStep ? 'bg-accent text-bg-primary' : i === currentStep ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg-tertiary text-text-tertiary'}`}>
                {i < currentStep ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${i <= currentStep ? 'text-text-primary' : 'text-text-tertiary'}`}>{step}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-px mx-2 ${i < currentStep ? 'bg-accent' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {currentStep === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Upload Dataset</CardTitle></CardHeader>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border-light'}`}
            >
              <input {...getInputProps()} />
              <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? 'text-accent' : 'text-text-tertiary'}`} />
              <p className="text-sm text-text-primary font-medium mb-1">
                {isDragActive ? 'Drop file here' : 'Drag & drop your dataset'}
              </p>
              <p className="text-xs text-text-tertiary mb-3">or click to browse files</p>
              <div className="flex items-center justify-center gap-2">
                {['CSV', 'XLSX', 'XLS'].map(fmt => (
                  <span key={fmt} className="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-tertiary font-medium">{fmt}</span>
                ))}
              </div>
              <p className="text-[10px] text-text-tertiary mt-2">Maximum file size: 50MB</p>
            </div>

            {file && (
              <div className="mt-4 p-3 rounded-lg bg-bg-tertiary/30 border border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-accent" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{file.name}</p>
                    <p className="text-xs text-text-tertiary">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setFile(null)} className="p-1 text-text-tertiary hover:text-risk-critical cursor-pointer"><X size={14} /></button>
                </div>
              </div>
            )}

            {uploading && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-text-tertiary mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-bg-tertiary">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {file && !uploading && (
              <Button className="mt-4 w-full" onClick={() => handleUpload()} icon={Upload}>Upload Dataset</Button>
            )}

            {!uploading && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
                <p className="text-xs text-text-tertiary">No dataset handy?</p>
                <Button variant="outline" size="sm" icon={Sparkles} onClick={handleUseDemoDataset}>Use Demo Dataset</Button>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Requirements</CardTitle></CardHeader>
            <div className="space-y-3 text-sm text-text-secondary">
              <p>Your dataset should include customer-level data with behavioral and demographic features.</p>
              <p className="font-medium text-text-primary">Recommended columns:</p>
              <ul className="space-y-1.5 text-xs">
                {['Customer ID', 'Tenure', 'Monthly Charges', 'Total Charges', 'Contract Type', 'Usage Metrics', 'Support Tickets', 'Churn Label (target variable)'].map(col => (
                  <li key={col} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-accent" />{col}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      )}

      {currentStep === 1 && dataset && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dataset Uploaded</CardTitle></CardHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Filename', value: dataset.filename },
                { label: 'Rows', value: formatNumber(dataset.rows) },
                { label: 'Columns', value: dataset.columns },
                { label: 'Status', value: 'Ready for Validation' },
              ].map(item => (
                <div key={item.label}>
                  <span className="text-xs text-text-tertiary">{item.label}</span>
                  <p className="text-sm font-medium text-text-primary mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
          <Button icon={Check} loading={validating} onClick={handleValidate}>Validate Dataset</Button>
        </div>
      )}

      {currentStep === 2 && validation && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="text-center">
              <span className="text-xs text-text-tertiary">Dataset Health</span>
              <p className="text-3xl font-bold text-accent mt-1">{validation.health}%</p>
            </Card>
            <Card className="text-center">
              <span className="text-xs text-text-tertiary">Missing Values</span>
              <p className="text-3xl font-bold text-risk-medium mt-1">{validation.missingValues}%</p>
            </Card>
            <Card className="text-center">
              <span className="text-xs text-text-tertiary">Duplicates</span>
              <p className="text-3xl font-bold text-risk-high mt-1">{validation.duplicates}</p>
            </Card>
            <Card className="text-center">
              <span className="text-xs text-text-tertiary">Status</span>
              <Badge variant="approved" size="md" className="mt-2">Passed with warnings</Badge>
            </Card>
          </div>

          {/* Warnings */}
          {validation.warnings?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Warnings</CardTitle></CardHeader>
              <div className="space-y-2">
                {validation.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <AlertTriangle size={12} className="text-risk-medium shrink-0" />
                    <span className="text-text-secondary">{w}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Column mapping */}
          <Card>
            <CardHeader><CardTitle>Column Mapping</CardTitle></CardHeader>
            <div className="space-y-2">
              {defaultMappings.map((m, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/20">
                  <span className="text-sm text-text-primary font-medium w-40">{m.source}</span>
                  <ArrowRight size={14} className="text-text-tertiary" />
                  <Select
                    value={mappings[m.source] || m.target}
                    onChange={(e) => setMappings(prev => ({ ...prev, [m.source]: e.target.value }))}
                    options={['customer_id', 'tenure', 'monthly_charges', 'total_charges', 'contract_type', 'churn']
                      .map(value => ({ value, label: value }))}
                    placeholder=""
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Preview */}
          {validation.preview && (
            <Card>
              <CardHeader><CardTitle>Data Preview</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {Object.keys(validation.preview[0] || {}).map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-text-tertiary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validation.preview.map((row, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-text-secondary tabular-nums">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Button icon={ArrowRight} onClick={handleMapColumns}>Save Mapping & Process</Button>
        </div>
      )}

      {(currentStep === 3 || currentStep === 4) && (
        <div className="space-y-4">
          <Card className="text-center py-12">
            <div className="w-12 h-12 rounded-full border-2 border-border border-t-accent animate-spin mx-auto mb-4" />
            <h3 className="text-base font-semibold text-text-primary mb-1">
              {currentStep === 3 ? 'Processing Dataset...' : 'Ready for Prediction'}
            </h3>
            <p className="text-sm text-text-tertiary mb-6">
              {currentStep === 3 ? 'Cleaning and transforming your data...' : 'Dataset processed. Click to run churn predictions.'}
            </p>
            {currentStep === 4 && (
              <Button icon={Sparkles} loading={predicting} onClick={handlePredict}>Run Churn Prediction</Button>
            )}
          </Card>
          <ModelArchitecture defaultOpen />
        </div>
      )}

      {currentStep >= 5 && (
        <Card className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-risk-low/10 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-risk-low" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">Predictions Complete</h3>
          <p className="text-sm text-text-tertiary mb-6">Churn predictions have been generated for all customers in your dataset.</p>
          <div className="flex items-center justify-center gap-3">
            <Button icon={Database} onClick={() => window.location.href = '/dashboard'}>View Dashboard</Button>
            <Button variant="outline" onClick={() => window.location.href = '/customers'}>View Customers</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
