import { useEffect, useState } from 'react';
import type { ComplianceIssue, DesignContent } from "@/design/types";
import { checkBrandCompliance } from '@/design/brandCompliance';
import { AlertCircle, CheckCircle2, AlertTriangle, Shield, FileText, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface BrandCompliancePanelProps {
  content: DesignContent;
}

export function BrandCompliancePanel({ content }: BrandCompliancePanelProps) {
  const [issues, setIssues] = useState<ComplianceIssue[]>([]);
  const [isCompliant, setIsCompliant] = useState(false);

  useEffect(() => {
    const complianceIssues = checkBrandCompliance(content);
    setIssues(complianceIssues);
    
    // Only errors block compliance
    const hasErrors = complianceIssues.some(issue => issue.severity === 'error');
    setIsCompliant(!hasErrors);
  }, [content]);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Brand Compliance</h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Overall Status */}
        {isCompliant ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <span className="font-medium">All checks passed!</span>
              <br />
              Your design meets all brand guidelines.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <span className="font-medium">{errorCount} issue{errorCount !== 1 ? 's' : ''} found</span>
              <br />
              Please resolve errors before exporting.
            </AlertDescription>
          </Alert>
        )}

        {/* Issues List */}
        {issues.length > 0 && (
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div
                key={index}
                className={`flex gap-3 p-3 rounded-lg border ${
                  issue.severity === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                {issue.severity === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${
                    issue.severity === 'error' ? 'text-red-800' : 'text-yellow-800'
                  }`}>
                    {issue.message}
                  </p>
                  {issue.location && (
                    <p className={`text-xs mt-1 ${
                      issue.severity === 'error' ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      Location: {issue.location}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-semibold text-gray-900">{errorCount}</div>
            <div className="text-xs text-gray-600 mt-1">Errors</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-semibold text-gray-900">{warningCount}</div>
            <div className="text-xs text-gray-600 mt-1">Warnings</div>
          </div>
        </div>

        {/* Guidelines Info */}
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <p className="text-xs font-medium text-gray-700">Active Guidelines:</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span>Brand color palette enforced</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span>Typography system locked</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span>Auto spacing rules applied</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span>Content validation active</span>
            </div>
          </div>
        </div>

        {/* 가이드라인 파일 (관리자 지정, 읽기 전용) */}
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <p className="text-xs font-medium text-gray-700">가이드라인 파일</p>
          <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed">
            <FileText className="w-4 h-4 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm text-gray-700 font-medium">Axis_Brand_Guidelines_2026.pdf</p>
              <p className="text-xs text-gray-500">관리자 지정 파일 (수정 불가)</p>
            </div>
          </div>
        </div>

        {/* AI 추가제안 버튼 */}
        <div className="pt-3 border-t border-gray-200">
          <Button
            variant="outline"
            className="w-full justify-center gap-2 border-[#FF7F66] text-[#FF7F66] hover:bg-[#FF7F66]/10"
          >
            <Sparkles className="w-4 h-4" />
            AI 추가제안
          </Button>
        </div>
      </div>
    </div>
  );
}