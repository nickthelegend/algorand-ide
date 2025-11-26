"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"

import { Sidebar } from "@/components/sidebar"
import { CodeEditorDynamic as CodeEditor } from "@/components/code-editor-dynamic"
import { WebContainerTerminal } from "@/components/webcontainer-terminal"
import AIChat from "@/components/ai-chat"
import { BuildToolbar } from "@/components/build-toolbar"
import { BuildPanel } from "@/components/build-panel"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { WalletPanel } from "@/components/wallet-panel"
import { TutorialPanel } from "@/components/tutorial-panel"
import { ArtifactsPanel } from "@/components/artifacts-panel"
import { ProgramsPanel } from "@/components/programs-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { ArtifactFileViewerPanel } from "@/components/artifact-file-viewer-panel"

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

import { useToast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import algosdk from "algosdk"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TransactionBuilder } from "@/components/transaction-builder"
import { GitHubLogin } from "@/components/github-login"

interface Wallet {
  address: string
  balance: number
  privateKey: string
  mnemonic: string
  transactions: any[]
  algoPrice: number
}

export default function AlgorandIDE({ initialFiles, selectedTemplate, selectedTemplateName, projectId }: { initialFiles: any, selectedTemplate: string, selectedTemplateName: string, projectId?: string }) {
  const [currentFiles, setCurrentFiles] = useState<any>(initialFiles);

  const getAllFileContents = (tree: any, currentPath: string = '') => {
    let contents: Record<string, string> = {};
    for (const key in tree) {
      const newPath = currentPath ? `${currentPath}/${key}` : key;
      if (tree[key].file) {
        contents[newPath] = tree[key].file.contents;
      } else if (tree[key].directory) {
        contents = { ...contents, ...getAllFileContents(tree[key].directory, newPath) };
      }
    }
    return contents;
  };

  const [activeFile, setActiveFile] = useState("");
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>(() => getAllFileContents(currentFiles));
  const [sidebarSection, setSidebarSection] = useState("explorer")
  const [showWallet, setShowWallet] = useState(false)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [activeArtifactFile, setActiveArtifactFile] = useState<string | null>(null);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [deployArgs, setDeployArgs] = useState<any[]>([]);
  const [currentDeployFilename, setCurrentDeployFilename] = useState<string | null>(null);
  const [contractArgs, setContractArgs] = useState<any[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<'deploying' | 'success' | 'error' | null>(null);
  const [deployedAppId, setDeployedAppId] = useState<string>('');
  const [isMethodsModalOpen, setIsMethodsModalOpen] = useState(false);
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState<any>(null);
  const [executeArgs, setExecuteArgs] = useState<any[]>([]);

  // Layout state
  const [showAIChat, setShowAIChat] = useState(false)
  const [showBuildPanel, setShowBuildPanel] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [isReady, setIsReady] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const { toast } = useToast();
  const [deployedContracts, setDeployedContracts] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("deployedContracts") || "[]");
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    setCurrentFiles(initialFiles);
    setFileContents(getAllFileContents(initialFiles));
    setIsReady(true);

    const savedWallet = localStorage.getItem("algorand-wallet")
    if (savedWallet) {
      try {
        const parsedWallet = JSON.parse(savedWallet)
        if (parsedWallet && typeof parsedWallet.address === 'string') {
          setWallet(parsedWallet)
        } else {
          localStorage.removeItem("algorand-wallet")
        }
      } catch (error) {
        localStorage.removeItem("algorand-wallet")
      }
    }

    if (typeof window !== 'undefined' && selectedTemplate === 'PuyaTs') {
      const urlParams = new URLSearchParams(window.location.search);
      const encodedContract = urlParams.get('contract');
      if (encodedContract) {
        loadContract(encodedContract);
      }
    }
  }, [initialFiles, selectedTemplate]);

  const loadContract = async (encoded: string) => {
    try {
      handleTerminalOutput("Loading contract...");
      
      const response = await fetch('/api/load-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ encoded })
      });
      
      const result = await response.json();
      
      if (result.success && result.code) {
        const updatedFiles = { ...currentFiles };
        const newFileContents = { ...fileContents };
        
        updatedFiles[result.filename] = {
          file: { contents: result.code }
        };
        
        newFileContents[result.filename] = result.code;
        
        setCurrentFiles(updatedFiles);
        setFileContents(newFileContents);
        openFile(result.filename);
        handleTerminalOutput(`Contract loaded: ${result.filename}`);
      } else {
        handleTerminalOutput(`Failed to load contract: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      handleTerminalOutput(`Failed to load contract: ${error.message || error}`);
    }
  };

  const handleTerminalOutput = useCallback((data: string) => {
    setTerminalOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${data}`]);
  }, []);

  const createWallet = async () => {
    try {
      const algosdk = await import("algosdk")
      const account = algosdk.generateAccount()

      const newWallet = {
        address: account.addr.toString(),
        balance: 0,
        privateKey: algosdk.secretKeyToMnemonic(account.sk),
        mnemonic: algosdk.secretKeyToMnemonic(account.sk),
        transactions: [],
        algoPrice: 0,
      }

      setWallet(newWallet)
      localStorage.setItem("algorand-wallet", JSON.stringify(newWallet))
      
    } catch (error) {
    }
  }

  const openFile = (filePath: string) => {
    if (!openFiles.includes(filePath)) {
      setOpenFiles((prev) => [...prev, filePath])
    }
    setActiveFile(filePath)
  }

  const closeFile = (filePath: string) => {
    const newOpenFiles = openFiles.filter((f) => f !== filePath)
    setOpenFiles(newOpenFiles)

    if (activeFile === filePath) {
      const currentIndex = openFiles.indexOf(filePath)
      const nextFile = newOpenFiles[currentIndex] || newOpenFiles[currentIndex - 1] || newOpenFiles[0]
      setActiveFile(nextFile || "")
    }
  }

  const createFile = async (filePath: string) => {
    setFileContents((prev) => ({ ...prev, [filePath]: "" }));
    setOpenFiles((prev) => [...prev, filePath]);
    setActiveFile(filePath);
  };

  const renameFile = async (oldPath: string, newPath: string) => {
    const content = fileContents[oldPath] || '';
    setFileContents((prev) => {
      const updated = { ...prev };
      updated[newPath] = content;
      delete updated[oldPath];
      return updated;
    });
    setOpenFiles((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
    if (activeFile === oldPath) {
      setActiveFile(newPath);
    }
  };

  const deleteFile = async (filePath: string) => {
    setFileContents((prev) => {
      const updated = { ...prev };
      delete updated[filePath];
      return updated;
    });
    closeFile(filePath);
  };

  const handlePuyaTsBuild = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Compiling PuyaTs contract...");
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedFiles = { ...currentFiles };
      updatedFiles.artifacts = { directory: {} };
      
      const newFileContents = { ...fileContents };
      Object.keys(newFileContents).forEach(key => {
        if (key.startsWith('artifacts/') || key.startsWith('tmp/') || key.startsWith('cache/') || key.startsWith('dist/')) {
          delete newFileContents[key];
        }
      });
      
      const algoFiles = Object.keys(fileContents).filter(path => path.endsWith('.algo.ts'));
      
      if (algoFiles.length === 0) {
        handleTerminalOutput("No .algo.ts files found.");
        return;
      }
      
      for (const filePath of algoFiles) {
        const filename = filePath.split('/').pop();
        const contractName = filename?.replace('.algo.ts', '') || 'contract';
        const code = fileContents[filePath];
        
        
        if (!code || code.trim().length === 0) {
          handleTerminalOutput(`Skipping empty file: ${filePath}`);
          continue;
        }
        
        handleTerminalOutput(`Compiling ${filePath}...`);
        
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Force-Fresh-Compiler': 'true',
          },
          body: JSON.stringify({
            type: 'puyats',
            filename,
            code,
            forceFresh: true
          })
        });
        
        const result = await response.json();
        
        if (result.ok && result.files) {
          for (const [fileName, fileData] of Object.entries(result.files)) {
            const data = (fileData as any).data;
            const encoding = (fileData as any).encoding;
            const content = encoding === 'base64' ? atob(data) : data;
            
            const uniqueFileName = fileName.replace(/^[^.]+/, contractName);
            
            updatedFiles.artifacts.directory[uniqueFileName] = {
              file: { contents: content }
            };
            
            newFileContents[`artifacts/${uniqueFileName}`] = content;
          }
          handleTerminalOutput(`Successfully compiled ${filePath}`);
        } else {
          handleTerminalOutput(`Failed to compile ${filePath}: ${result.error || 'Unknown error'}`);
        }
      }
      
      setCurrentFiles(updatedFiles);
      setFileContents(newFileContents);
    } catch (error: any) {
      handleTerminalOutput(`Build failed: ${error.message || error}`);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleTealScriptBuild = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Compiling TealScript contract...");
    
    try {
      const algoFiles = Object.keys(fileContents).filter(path => path.endsWith('.algo.ts'));
      
      if (algoFiles.length === 0) {
        handleTerminalOutput("No .algo.ts files found.");
        return;
      }
      
      for (const filePath of algoFiles) {
        const filename = filePath.split('/').pop();
        const code = fileContents[filePath];
        
        handleTerminalOutput(`Compiling ${filename}...`);
        
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'tealscript',
            filename,
            code
          })
        });
        
        const result = await response.json();
        
        if (result.ok && result.result) {
          const updatedFiles = { ...currentFiles };
          if (!updatedFiles.artifacts) {
            updatedFiles.artifacts = { directory: {} };
          }
          
          const newFileContents = { ...fileContents };
          
          const sections = result.result.split('=== ');
          for (const section of sections) {
            if (section.trim()) {
              const lines = section.split('\n');
              const fileName = lines[0].replace(' ===', '').trim();
              const content = lines.slice(1).join('\n').trim();
              
              if (fileName && content) {
                updatedFiles.artifacts.directory[fileName] = {
                  file: { contents: content }
                };
                
                newFileContents[`artifacts/${fileName}`] = content;
              }
            }
          }
          
          setCurrentFiles(updatedFiles);
          setFileContents(newFileContents);
          handleTerminalOutput(`Successfully compiled ${filename}`);
        } else {
          handleTerminalOutput(`Failed to compile ${filename}: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      handleTerminalOutput(`Build failed: ${error.message || error}`);
    } finally {
      setIsBuilding(false);
    }
  };

  const handlePuyaPyBuild = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Compiling PuyaPy contract...");
    
    try {
      const contractFile = fileContents['contract.py'];
      if (!contractFile) {
        handleTerminalOutput("No contract.py file found.");
        return;
      }
      
      
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'puyapy',
          code: btoa(contractFile)
        })
      });
      
      const result = await response.json();
      
      if (result.ok && result.files) {
        const updatedFiles = { ...currentFiles };
        if (!updatedFiles.artifacts) {
          updatedFiles.artifacts = { directory: {} };
        }
        
        const newFileContents = { ...fileContents };
        
        for (const [fileName, fileData] of Object.entries(result.files)) {
          const data = (fileData as any).data;
          const encoding = (fileData as any).encoding;
          const content = encoding === 'base64' ? atob(data) : data;
          
          updatedFiles.artifacts.directory[fileName] = {
            file: { contents: content }
          };
          
          newFileContents[`artifacts/${fileName}`] = content;
        }
        
        setCurrentFiles(updatedFiles);
        setFileContents(newFileContents);
        handleTerminalOutput("PuyaPy compilation completed successfully");
      } else {
        handleTerminalOutput(`Compilation failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      handleTerminalOutput(`Build failed: ${error.message || error}`);
    } finally {
      setIsBuilding(false);
    }
  }

  const handlePyTealBuild = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Compiling PyTeal contract...");
    
    try {
      const contractFile = fileContents['contract.py'];
      if (!contractFile) {
        handleTerminalOutput("No contract.py file found.");
        return;
      }
      
      
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'pyteal',
          code: btoa(contractFile)
        })
      });
      
      const result = await response.json();
      
      if (result.ok && result.files) {
        const updatedFiles = { ...currentFiles };
        if (!updatedFiles.artifacts) {
          updatedFiles.artifacts = { directory: {} };
        }
        
        const newFileContents = { ...fileContents };
        
        for (const [fileName, fileData] of Object.entries(result.files)) {
          const data = (fileData as any).data;
          const encoding = (fileData as any).encoding;
          const content = encoding === 'base64' ? atob(data) : data;
          
          updatedFiles.artifacts.directory[fileName] = {
            file: { contents: content }
          };
          
          newFileContents[`artifacts/${fileName}`] = content;
        }
        
        setCurrentFiles(updatedFiles);
        setFileContents(newFileContents);
        handleTerminalOutput("PyTeal compilation completed successfully");
      } else {
        handleTerminalOutput(`Compilation failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      handleTerminalOutput(`Build failed: ${error.message || error}`);
    } finally {
      setIsBuilding(false);
    }
  }

  const handleBuild = async () => {
    setShowBuildPanel(true);
    
    if (selectedTemplate === 'PuyaTs') {
      await handlePuyaTsBuild();
      return;
    }
    
    if (selectedTemplate === 'PuyaPy') {
      await handlePuyaPyBuild();
      return;
    }
    
    if (selectedTemplate === 'Pyteal' || selectedTemplate === 'PyTeal') {
      await handlePyTealBuild();
      return;
    }
    
    if (selectedTemplate === 'TealScript') {
      await handleTealScriptBuild();
      return;
    }
    
    handleTerminalOutput("No build process needed for this template.");
  };

  const handleTest = async () => {
    handleTerminalOutput("Tests not implemented yet.");
  };

  const handleDeploy = async () => {
    handleTerminalOutput("Use the artifacts panel to deploy contracts.");
  };

  const handleGenerateClient = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Generating client...");
    
    try {
      const arc32Files = Object.keys(fileContents).filter(path => path.endsWith('.arc32.json'));
      
      if (arc32Files.length === 0) {
        handleTerminalOutput("No .arc32.json files found.");
        return;
      }
      
      for (const filePath of arc32Files) {
        const arc32Content = fileContents[filePath];
        const arc32Json = JSON.parse(arc32Content);
        
        
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'generate-client',
            arc32Json
          })
        });
        
        const result = await response.json();
        
        if (result.ok && result.files) {
          const updatedFiles = { ...currentFiles };
          if (!updatedFiles.clients) {
            updatedFiles.clients = { directory: {} };
          }
          
          const newFileContents = { ...fileContents };
          
          for (const [fileName, fileData] of Object.entries(result.files)) {
            const data = (fileData as any).data;
            const encoding = (fileData as any).encoding;
            const content = encoding === 'base64' ? atob(data) : data;
            
            updatedFiles.clients.directory[fileName] = {
              file: { contents: content }
            };
            
            newFileContents[`clients/${fileName}`] = content;
          }
          
          setCurrentFiles(updatedFiles);
          setFileContents(newFileContents);
          handleTerminalOutput(`Successfully generated client for ${filePath}`);
        } else {
          handleTerminalOutput(`Failed to generate client for ${filePath}: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      handleTerminalOutput(`Client generation failed: ${error.message || error}`);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleStop = () => {
    setIsBuilding(false)
  }

  const handleClearLogs = () => {
    setTerminalOutput([])
  }

  const handleDownloadSnapshot = async () => {
    setIsBuilding(true);
    handleTerminalOutput("Creating snapshot...");
    try {
      const jsonData = JSON.stringify(currentFiles, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate}-snapshot.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      handleTerminalOutput("Snapshot downloaded successfully.");
    } catch (error) {
      handleTerminalOutput(`Snapshot failed: ${error}`);
    } finally {
      setIsBuilding(false);
    }
  }

  const executeDeploy = async (filename: string, args: (string | number)[]) => {
    setIsDeploying(true);
    setDeployStatus('deploying');
    try {
      const artifactPath = `artifacts/${filename}`;
      const fileContent = fileContents[artifactPath] || '';
      if (!fileContent) {
        throw new Error(`Artifact file ${filename} not found`);
      }
      
      const appSpec = JSON.parse(fileContent);

      let contractSpec = appSpec;
      if (filename.endsWith('.arc32.json') && appSpec.contract) {
        contractSpec = appSpec.contract;
      }

      if(!wallet){
        throw new Error("Wallet not connected");
      }
      const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
      const creator = wallet;

      const { AlgorandClient } = await import("@algorandfoundation/algokit-utils");
      const algorandClient = AlgorandClient.fromConfig({
        algodConfig: { server: "https://testnet-api.algonode.cloud", token: "" },
        indexerConfig: { server: "https://testnet-idx.algonode.cloud", token: "" },
      });

      const appFactory = algorandClient.client.getAppFactory({
        appSpec,
        defaultSender: creator.address,
        defaultSigner: algosdk.makeBasicAccountTransactionSigner(account)
      });

      const hasBareCreate = appSpec.bare_call_config?.no_op === 'CREATE';
      const hasCreateMethod = appSpec.hints?.['createApplication()void'];
      
      let deployResult;
      if (hasBareCreate) {
        deployResult = await (appFactory.send as any).bare.create({
          sender: account.addr,
          signer: algosdk.makeBasicAccountTransactionSigner(account)
        });
      } else if (hasCreateMethod) {
        deployResult = await appFactory.send.create({
          method: 'createApplication',
          methodArgs: args,
          sender: account.addr,
          signer: algosdk.makeBasicAccountTransactionSigner(account)
        });
      } else {
        throw new Error('Contract has no CREATE handler (bare or ABI)');
      }

      let appId = 'unknown';
      let txId = 'unknown';
      if (deployResult?.result) {
        const resultAny = deployResult.result as any;
        if (resultAny.appId !== undefined && resultAny.appId !== null) {
          appId = String(resultAny.appId);
        }
        if (typeof resultAny.txId === 'string') {
          txId = resultAny.txId;
        } else if (typeof resultAny.transactionId === 'string') {
          txId = resultAny.transactionId;
        }
      }
      const deployed = {
        appId,
        txId,
        artifact: filename,
        time: Date.now(),
        methods: contractSpec.methods,
      };
      const prev = JSON.parse(localStorage.getItem("deployedContracts") || "[]");
      const updated = [deployed, ...prev];
      localStorage.setItem("deployedContracts", JSON.stringify(updated));
      setDeployedContracts(updated);
      setDeployedAppId(deployed.appId);
      setDeployStatus('success');
    } catch (error: any) {
      setDeployStatus('error');
      toast({ 
        title: "❌ Deployment Failed", 
        description: error.message || String(error), 
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsDeploying(false);
      setIsDeployModalOpen(false);
    }
  };

  const deployArtifact = async (filename: string) => {
    try {
      const artifactPath = `artifacts/${filename}`;
      const fileContent = fileContents[artifactPath] || '';
      if (!fileContent) {
        throw new Error(`Artifact file ${filename} not found`);
      }
      
      const appSpec = JSON.parse(fileContent);

      let contractSpec = appSpec;
      if (filename.endsWith('.arc32.json') && appSpec.contract) {
        contractSpec = appSpec.contract;
      }

      if (!contractSpec.methods || !Array.isArray(contractSpec.methods)) {
        await executeDeploy(filename, []);
        return;
      }

      const createMethod = contractSpec.methods.find((m: any) => 
        m && (m.name === "createApplication" || m.actions?.create === true)
      );

      if (createMethod && createMethod.args && createMethod.args.length > 0) {
        setCurrentDeployFilename(filename);
        setContractArgs(createMethod.args);
        const initialArgs = createMethod.args.map((arg: any) => {
            const argType = arg?.type || arg?.struct || '';
            if (typeof argType === 'string' && argType.includes('uint')) return 0;
            if (argType === 'address') return wallet?.address || '';
            return '';
        });
        setDeployArgs(initialArgs);
        setIsDeployModalOpen(true);
      } else {
        await executeDeploy(filename, []);
      }
    } catch (error: any) {
      setDeployStatus('error');
      toast({ 
        title: "❌ Deployment Failed", 
        description: error.message || String(error), 
        variant: "destructive",
        duration: 5000
      });
    }
  };

  const saveProject = async () => {
    if (!projectId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ file_structure: currentFiles })
      });
      
      if (response.ok) {
        handleTerminalOutput('Project saved successfully');
      } else {
        handleTerminalOutput('Failed to save project');
      }
    } catch (error) {
      handleTerminalOutput('Failed to save project');
    }
  };

  const handleSave = async () => {
    if (!activeFile || !fileContents[activeFile]) return;
    
    try {
      handleTerminalOutput(`Saved: ${activeFile}`);
      if (window && (window as any).clearUnsavedFile) {
        (window as any).clearUnsavedFile(activeFile);
      }
      if (projectId) {
        await saveProject();
      }
    } catch (error) {
      handleTerminalOutput(`Failed to save: ${activeFile}`);
    }
  };

  const handleSidebarSectionChange = (section: string) => {
    if (section === 'ai-chat') {
      setShowAIChat(true);
      return;
    }
    if (section === 'build-panel') {
      setShowBuildPanel(true);
      return;
    }
    setSidebarSection(section);
  };

  const executeMethod = async () => {
    if (!selectedContract || !selectedMethod) return;
    setIsDeploying(true);
    try {
      const artifactPath = `artifacts/${selectedContract.artifact}`;
      const fileContent = fileContents[artifactPath] || '';
      if (!fileContent) {
        throw new Error(`Artifact file ${selectedContract.artifact} not found`);
      }
      
      const appSpec = JSON.parse(fileContent);

      if(!wallet){
        throw new Error("Wallet not connected");
      }
      const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
      const creator = wallet;

      const { AlgorandClient } = await import("@algorandfoundation/algokit-utils");
      const algorandClient = AlgorandClient.fromConfig({
        algodConfig: { server: "https://testnet-api.algonode.cloud", token: "" },
        indexerConfig: { server: "https://testnet-idx.algonode.cloud", token: "" },
      });

      const appClient = algorandClient.client.getAppClientById({
        appSpec,
        appId : BigInt(selectedContract.appId),
        defaultSender : creator.address,
        defaultSigner: algosdk.makeBasicAccountTransactionSigner(account)
      });

      const result = await appClient.send.call({
        method: selectedMethod.name, 
        args: executeArgs,
        sender: creator.address, 
        signer: algosdk.makeBasicAccountTransactionSigner(account),
        populateAppCallResources: true,
        staticFee: (2_000).microAlgo(),
      })

      toast({ title: "Method executed successfully!", description: `Result: ${result.return}` });
    } catch (error: any) {
      toast({ title: "Method execution failed", description: error.message || String(error), variant: "destructive" });
    } finally {
      setIsDeploying(false);
      setIsExecuteModalOpen(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "var(--background-color)", color: "var(--text-color)" }}>
      {/* Title Bar */}
      <div className="h-9 flex items-center justify-between px-4 text-sm border-b flex-shrink-0" style={{ backgroundColor: "var(--sidebar-color)", borderColor: "var(--border-color)" }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#28ca42]"></div>
          </div>
          <span className="font-medium" style={{ color: "var(--text-color)" }}>Algokit IDE</span>
        </div>
        <div className="font-medium text-sm" style={{ color: "var(--text-color)" }}>{selectedTemplateName}</div>
        <div className="flex items-center gap-3">
          <GitHubLogin />
          {wallet && wallet.address ? (
            <button
              onClick={() => setShowWallet(!showWallet)}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ backgroundColor: "var(--button-color)", color: "var(--text-color)" }}
            >
              Wallet: {`${String(wallet.address.substring(0,10))}...` || "Invalid Address"}
            </button>
          ) : (
            <button
              onClick={createWallet}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ backgroundColor: "var(--button-color)", color: "var(--text-color)" }}
            >
              Create Wallet
            </button>
          )}
        </div>
      </div>

      {/* Build Toolbar */}
      <BuildToolbar
        onBuild={handleBuild}
        onTest={handleTest}
        onDeploy={handleDeploy}
        onGenerateClient={handleGenerateClient}
        isBuilding={isBuilding}
        onStop={handleStop}
        isWebContainerReady={isReady}
        onSave={handleSave}
      />

      {/* Main Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
          <div className="h-full border-r" style={{ backgroundColor: "var(--sidebar-color)", borderColor: "var(--border-color)" }}>
            <Sidebar
              activeSection={sidebarSection}
              onSectionChange={handleSidebarSectionChange}
              activeFile={activeFile}
              onFileSelect={openFile}
              webcontainer={null}
              onCreateFile={createFile}
              onRenameFile={renameFile}
              onDeleteFile={deleteFile}
              isWebContainerReady={isReady}
              fileStructure={currentFiles}
              onArtifactFileSelect={setActiveArtifactFile}
              deployedContracts={deployedContracts}
              onContractSelect={(contract) => {
                setSelectedContract(contract);
                setIsMethodsModalOpen(true);
              }}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Content Area */}
        <ResizablePanel defaultSize={showBuildPanel ? 50 : 80}>
          <ResizablePanelGroup direction="vertical">
            {/* Editor Area */}
            <ResizablePanel defaultSize={70}>
              <ResizablePanelGroup direction="horizontal">
                {/* Code Editor */}
                <ResizablePanel defaultSize={showWallet ? 70 : 100}>
                  {activeArtifactFile ? (
                    <ArtifactFileViewerPanel
                      filePath={activeArtifactFile}
                      webcontainer={null}
                      fileContents={fileContents}
                      selectedTemplate={selectedTemplate}
                      onDeploy={deployArtifact}
                      onClose={() => setActiveArtifactFile(null)}
                    />
                  ) : sidebarSection === "tutorials" ? (
                    <TutorialPanel />
                  ) : (sidebarSection === "artifacts" || sidebarSection === "build") ? (
                    <ArtifactsPanel webcontainer={null} onDeploy={deployArtifact} fileContents={fileContents} />
                  ) : sidebarSection === "programs" ? (
                    <ProgramsPanel
                      deployedContracts={deployedContracts}
                      onContractSelect={(contract) => {
                        setSelectedContract(contract);
                        setIsMethodsModalOpen(true);
                      }}
                    />
                  ) : sidebarSection === "settings" ? (
                    <SettingsPanel />
                  ) : (
                    <CodeEditor
                      activeFile={activeFile}
                      openFiles={openFiles}
                      fileContents={fileContents}
                      onFileSelect={setActiveFile}
                      onFileClose={closeFile}
                      onFileContentChange={async (filePath, content) => {
                        setFileContents((prev) => {
                          const updated = { ...prev, [filePath]: content };
                          return updated;
                        });
                      }}
                      onSave={handleSave}
                      webcontainer={null}
                      template={selectedTemplate.toLowerCase() as 'pyteal' | 'tealscript' | 'puyapy' | 'puyats'}
                    />
                  )}
                </ResizablePanel>

                {/* Wallet Panel */}
                {showWallet && wallet && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
                      <div className="h-full border-l" style={{ backgroundColor: "var(--sidebar-color)", borderColor: "var(--border-color)" }}>
                        <WalletPanel wallet={wallet} onClose={() => setShowWallet(false)} />
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle />

            {/* Bottom Panel - Terminal */}
            <ResizablePanel defaultSize={30} minSize={20}>
              <ResizablePanelGroup direction="horizontal">
                {/* Build Terminal */}
                <ResizablePanel defaultSize={showAIChat ? 50 : 100}>
                  <div className="h-full border-t" style={{ backgroundColor: "var(--background-color)", borderColor: "var(--border-color)" }}>
                    <WebContainerTerminal
                      title="BUILD TERMINAL"
                      webcontainer={null}
                      output={terminalOutput}
                      onAddOutput={handleTerminalOutput}
                    />
                  </div>
                </ResizablePanel>

                {/* AI Chat Panel */}
                {showAIChat && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={50} minSize={30}>
                      <div className="h-full border-t border-l" style={{ backgroundColor: "var(--background-color)", borderColor: "var(--border-color)" }}>
                        <AIChat 
                          title="AI Chat" 
                          selectedTemplate={selectedTemplate}
                          activeFile={activeFile}
                          fileContent={activeFile ? fileContents[activeFile] : undefined}
                          onFileUpdate={async (filePath: string, content: string) => {
                            setFileContents((prev) => ({ ...prev, [filePath]: content }));
                          }}
                          onClose={() => setShowAIChat(false)}
                        />
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* Build Panel */}
        {showBuildPanel && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full border-l" style={{ backgroundColor: "var(--background-color)", borderColor: "var(--border-color)" }}>
                <div className="h-full flex flex-col">
                  <div className="h-9 bg-[#2d2d30] flex items-center justify-between px-3 text-xs font-medium uppercase tracking-wide border-b border-[#3e3e42] flex-shrink-0">
                    <span className="text-[#cccccc]">Build Panel</span>
                    <button
                      onClick={() => setShowBuildPanel(false)}
                      className="text-[#cccccc] hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex-1">
                    <BuildPanel
                      isBuilding={isBuilding}
                      buildOutput={terminalOutput}
                      onBuild={handleBuild}
                      onTest={handleTest}
                      onDeploy={handleDeploy}
                      onStop={handleStop}
                      onClearLogs={handleClearLogs}
                      artifacts={currentFiles.artifacts ? Object.keys(currentFiles.artifacts.directory).map(name => ({ name, size: 'Unknown' })) : []}
                      onDownloadSnapshot={handleDownloadSnapshot}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      
      <Dialog open={isDeployModalOpen} onOpenChange={setIsDeployModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy Contract: {currentDeployFilename}</DialogTitle>
            <DialogDescription>
              Please provide the arguments for the `createApplication` method.
            </DialogDescription>
          </DialogHeader>
          {isDeploying ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-4">
                {contractArgs.map((arg, index) => {
                  const argType = arg.type || arg.struct || 'string';
                  const isUint = typeof argType === 'string' && argType.includes('uint');
                  return (
                  <div className="grid grid-cols-4 items-center gap-4" key={arg.name || index}>
                    <Label htmlFor={`arg-${index}`} className="text-right">
                      {arg.name} ({argType})
                    </Label>
                    <Input
                      id={`arg-${index}`}
                      value={deployArgs[index] || ''}
                      onChange={(e) => {
                        const newArgs = [...deployArgs];
                        const value = isUint ? Number(e.target.value) : e.target.value;
                        newArgs[index] = value;
                        setDeployArgs(newArgs);
                      }}
                      className="col-span-3"
                      type={isUint ? 'number' : 'text'}
                    />
                  </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  if (currentDeployFilename) {
                    executeDeploy(currentDeployFilename, deployArgs);
                  }
                }}>
                  Deploy
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isMethodsModalOpen} onOpenChange={setIsMethodsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contract Methods</DialogTitle>
            <DialogDescription>
              Select a method to execute for contract: {selectedContract?.appId}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedContract?.methods.map((method: any) => (
              <div key={method.name} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{method.name}</span>
                    <Badge className="text-xs border border-input bg-background">
                      {method.args.length} args
                    </Badge>
                  </div>
                  <Button onClick={() => {
                    setSelectedMethod(method);
                    setExecuteArgs(method.args.map(() => ''));
                    setIsExecuteModalOpen(true);
                    setIsMethodsModalOpen(false);
                  }}>
                    Execute
                  </Button>
                </div>
                {method.args.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Arguments:</span>
                    <div className="mt-1 space-y-1">
                      {method.args.map((arg: any, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="font-mono text-xs">• {arg.name}:</span>
                          <span className="text-xs">{arg.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isExecuteModalOpen} onOpenChange={setIsExecuteModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Builder</DialogTitle>
            <DialogDescription>
              Build and execute transactions for your smart contract
            </DialogDescription>
          </DialogHeader>
          {selectedContract && selectedMethod && (
            <TransactionBuilder
              contract={selectedContract}
              method={selectedMethod}
              args={executeArgs}
              onArgsChange={setExecuteArgs}
              onExecute={executeMethod}
              isExecuting={isDeploying}
              wallet={wallet}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deployStatus !== null} onOpenChange={(open) => !open && setDeployStatus(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deployStatus === 'deploying' && 'Deploying Contract'}
              {deployStatus === 'success' && '✅ Deployment Successful!'}
              {deployStatus === 'error' && '❌ Deployment Failed'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8">
            {deployStatus === 'deploying' && (
              <>
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-sm text-muted-foreground">Deploying to TestNet...</p>
              </>
            )}
            {deployStatus === 'success' && (
              <>
                <div className="text-6xl mb-4">🎉</div>
                <p className="text-lg font-medium mb-2">Contract Deployed!</p>
                <p className="text-sm text-muted-foreground mb-4">App ID: {deployedAppId}</p>
                <Button
                  onClick={() => {
                    window.open(`https://lora.algokit.io/testnet/application/${deployedAppId}`, '_blank');
                    setDeployStatus(null);
                  }}
                  className="w-full"
                >
                  View on Explorer
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Toaster />
    </div>
  )
}